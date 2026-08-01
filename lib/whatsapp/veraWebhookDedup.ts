/**
 * Deduplicazione webhook WhatsApp + lock temporale risposte VERA.
 *
 * Perché: Meta/Twilio ritentano lo stesso POST; su Vercel due istanze possono
 * generare due reply Gemini sullo stesso inbound. SystemState dà claim atomico
 * cross-istanza senza dipendere dalla memoria del processo.
 */

import crypto from 'crypto';
import prisma from '@/lib/prisma';

/** Finestra anti-doppia reply sullo stesso inbound (mid 15–30s). */
export const VERA_OUTBOUND_LOCK_MS = 25_000;

/** TTL claim inbound (evita crescita illimitata di chiavi). */
const INBOUND_CLAIM_TTL_HOURS = 72;

/** TTL claim intento conversazionale (es. "Lunedì va benissimo"). */
const INTENT_CLAIM_TTL_MINUTES = 30;

function shortHash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 40);
}

function inboundKey(messageId: string): string {
    return `wa:in:${shortHash(messageId)}`;
}

function outboundLockKey(phoneE164: string, inboundMessageId: string): string {
    return `wa:out:${shortHash(`${phoneE164}|${inboundMessageId}`)}`;
}

function intentKey(phoneE164: string, intentFingerprint: string): string {
    return `wa:intent:${shortHash(`${phoneE164}|${intentFingerprint}`)}`;
}

/**
 * Claim atomico del messageId Meta in ingresso.
 * Ritorna false se già processato (retry webhook).
 */
export async function tryClaimInboundWhatsAppMessageId(
    messageId: string,
    phoneE164: string
): Promise<boolean> {
    const id = messageId.trim();
    if (!id) return true; // senza id non possiamo deduppare: lascia passare

    const key = inboundKey(id);
    const value = JSON.stringify({
        messageId: id,
        phoneE164,
        at: new Date().toISOString(),
    });

    try {
        // Scadenza: permette reclaim solo dopo TTL (casi eccezionali / cleanup).
        const claimed = await prisma.$queryRaw<Array<{ key: string }>>`
            INSERT INTO system_state (key, value, updated_at)
            VALUES (${key}, ${value}, NOW())
            ON CONFLICT (key) DO UPDATE
              SET value = EXCLUDED.value, updated_at = NOW()
              WHERE system_state.updated_at < NOW() - (${INBOUND_CLAIM_TTL_HOURS} * INTERVAL '1 hour')
            RETURNING key
        `;
        if (claimed.length > 0) return true;

        console.info(`[wa-dedup] Inbound già processato messageId=${id.slice(0, 24)}… phone=${phoneE164}`);
        return false;
    } catch (err) {
        console.error('[wa-dedup] Claim inbound fallito (fail-open):', err);
        return true;
    }
}

/**
 * Lock risposta automatica: stesso telefono + stesso inbound → al massimo 1 reply in 25s.
 * Senza inboundMessageId: lock sul solo telefono (fallback per payload incompleti).
 */
export async function tryClaimVeraOutboundReplyLock(params: {
    phoneE164: string;
    inboundMessageId?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: 'same_inbound' | 'phone_window' }> {
    const phone = params.phoneE164.trim();
    if (!phone) return { ok: true };

    const inboundId = params.inboundMessageId?.trim() || '';
    const lockMs = VERA_OUTBOUND_LOCK_MS;
    const nowIso = new Date().toISOString();
    const key = inboundId
        ? outboundLockKey(phone, inboundId)
        : `wa:outphone:${shortHash(phone)}`;
    const value = JSON.stringify({
        phoneE164: phone,
        inboundMessageId: inboundId || null,
        at: nowIso,
    });

    try {
        const claimed = await prisma.$queryRaw<Array<{ key: string }>>`
            INSERT INTO system_state (key, value, updated_at)
            VALUES (${key}, ${value}, NOW())
            ON CONFLICT (key) DO UPDATE
              SET value = EXCLUDED.value, updated_at = NOW()
              WHERE system_state.updated_at < NOW() - (${lockMs} * INTERVAL '1 millisecond')
            RETURNING key
        `;
        if (!claimed.length) {
            console.info(
                `[wa-dedup] Outbound bloccato phone=${phone}` +
                    (inboundId ? ` inbound=${inboundId.slice(0, 24)}…` : ' (no messageId)')
            );
            return { ok: false, reason: inboundId ? 'same_inbound' : 'phone_window' };
        }
        return { ok: true };
    } catch (err) {
        console.error('[wa-dedup] Claim outbound fallito (fail-open):', err);
        return { ok: true };
    }
}

/** Rilascia il lock outbound dopo invio fallito (permette un retry legittimo). */
export async function releaseVeraOutboundReplyLock(params: {
    phoneE164: string;
    inboundMessageId?: string | null;
}): Promise<void> {
    const phone = params.phoneE164.trim();
    if (!phone) return;
    const inboundId = params.inboundMessageId?.trim() || '';
    const key = inboundId
        ? outboundLockKey(phone, inboundId)
        : `wa:outphone:${shortHash(phone)}`;
    try {
        await prisma.systemState.deleteMany({ where: { key } });
    } catch (err) {
        console.warn('[wa-dedup] Release outbound lock fallito:', err);
    }
}

/**
 * Guard DB: esiste già un OUTBOUND VERA legato allo stesso inbound messageId.
 */
export async function hasOutboundReplyForInboundMessageId(
    phoneKey: string,
    inboundMessageId: string
): Promise<boolean> {
    const id = inboundMessageId.trim();
    if (!id) return false;
    try {
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT m.id
            FROM whatsapp_chat_messages m
            JOIN whatsapp_chat_sessions s ON s.id = m.session_id
            WHERE s.phone = ${phoneKey}
              AND m.direction = 'OUTBOUND'
              AND m.metadata IS NOT NULL
              AND m.metadata->>'replyToMessageId' = ${id}
            LIMIT 1
        `;
        return rows.length > 0;
    } catch (err) {
        console.warn('[wa-dedup] Check replyToMessageId fallito:', err);
        return false;
    }
}

/**
 * Claim intento conversazionale (conferma cortesia/data).
 * Perché: stesso "Lunedì va benissimo" non deve riaprire N prompt Gemini.
 */
export async function tryClaimConversationIntent(params: {
    phoneE164: string;
    intentFingerprint: string;
}): Promise<boolean> {
    const phone = params.phoneE164.trim();
    const fp = params.intentFingerprint.trim();
    if (!phone || !fp) return true;

    const key = intentKey(phone, fp);
    const value = JSON.stringify({
        phoneE164: phone,
        intentFingerprint: fp,
        at: new Date().toISOString(),
    });
    const ttlMin = INTENT_CLAIM_TTL_MINUTES;

    try {
        const claimed = await prisma.$queryRaw<Array<{ key: string }>>`
            INSERT INTO system_state (key, value, updated_at)
            VALUES (${key}, ${value}, NOW())
            ON CONFLICT (key) DO UPDATE
              SET value = EXCLUDED.value, updated_at = NOW()
              WHERE system_state.updated_at < NOW() - (${ttlMin} * INTERVAL '1 minute')
            RETURNING key
        `;
        if (!claimed.length) {
            console.info(`[wa-dedup] Intent già gestito phone=${phone} fp=${fp.slice(0, 48)}`);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[wa-dedup] Claim intent fallito (fail-open):', err);
        return true;
    }
}

/** Fingerprint stabile per conferme di cortesia/data (normalizzato). */
export function buildCourtesyConfirmIntentFingerprint(message: string): string {
    return message
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}
