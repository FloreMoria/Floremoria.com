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

function phoneBurstKey(phoneE164: string): string {
    return `wa:outphone:${shortHash(phoneE164)}`;
}

async function tryClaimLockKey(
    key: string,
    value: string,
    lockMs: number
): Promise<boolean> {
    const claimed = await prisma.$queryRaw<Array<{ key: string }>>`
        INSERT INTO system_state (key, value, updated_at)
        VALUES (${key}, ${value}, NOW())
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = NOW()
          WHERE system_state.updated_at < NOW() - (${lockMs} * INTERVAL '1 millisecond')
        RETURNING key
    `;
    return claimed.length > 0;
}

/**
 * Lock risposta automatica:
 * 1) stesso inbound messageId → max 1 reply (retry Meta);
 * 2) stesso telefono → max 1 reply VERA testo ogni 25s (burst, caso Benedetta).
 *
 * Media/foto inbound: salta il burst sul telefono così foto posa sequenziali
 * non vengono scartate come "duplicato" (resta solo il claim per wamid).
 */
export async function tryClaimVeraOutboundReplyLock(params: {
    phoneE164: string;
    inboundMessageId?: string | null;
    /** Se true (allegato immagine), non applicare il phone burst. */
    hasMedia?: boolean;
}): Promise<{ ok: true } | { ok: false; reason: 'same_inbound' | 'phone_window' }> {
    const phone = params.phoneE164.trim();
    if (!phone) return { ok: true };

    const inboundId = params.inboundMessageId?.trim() || '';
    const lockMs = VERA_OUTBOUND_LOCK_MS;
    const nowIso = new Date().toISOString();
    const value = JSON.stringify({
        phoneE164: phone,
        inboundMessageId: inboundId || null,
        hasMedia: Boolean(params.hasMedia),
        at: nowIso,
    });

    try {
        if (inboundId) {
            const sameInbound = await tryClaimLockKey(outboundLockKey(phone, inboundId), value, lockMs);
            if (!sameInbound) {
                console.info(
                    `[wa-dedup] Outbound bloccato (same inbound) phone=${phone} inbound=${inboundId.slice(0, 24)}…`
                );
                return { ok: false, reason: 'same_inbound' };
            }
        }

        // Foto/allegati: consentiti in sequenza (niente phone burst).
        if (params.hasMedia) {
            return { ok: true };
        }

        const phoneOk = await tryClaimLockKey(phoneBurstKey(phone), value, lockMs);
        if (!phoneOk) {
            console.info(`[wa-dedup] Outbound bloccato (phone burst 25s, testo) phone=${phone}`);
            return { ok: false, reason: 'phone_window' };
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
    try {
        const keys = [phoneBurstKey(phone)];
        if (inboundId) keys.push(outboundLockKey(phone, inboundId));
        for (const key of keys) {
            await prisma.systemState.deleteMany({ where: { key } });
        }
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

/** Finestra corta per testo outbound identico (non si applica a media). */
export const VERA_IDENTICAL_TEXT_DEDUP_MS = 12_000;

/**
 * Blocca solo testo outbound IDENTICO allo stesso numero entro pochi secondi.
 * Perché: anti double-click / doppio send staff — le foto restano sempre libere.
 */
export async function tryClaimIdenticalTextOutbound(params: {
    phoneE164: string;
    text: string;
}): Promise<boolean> {
    const phone = params.phoneE164.trim();
    const text = params.text.trim();
    if (!phone || !text) return true;

    const key = `wa:txt:${shortHash(`${phone}|${text}`)}`;
    const value = JSON.stringify({ phoneE164: phone, at: new Date().toISOString() });
    const lockMs = VERA_IDENTICAL_TEXT_DEDUP_MS;

    try {
        const claimed = await tryClaimLockKey(key, value, lockMs);
        if (!claimed) {
            console.info(
                `[wa-dedup] Testo outbound identico bloccato phone=${phone} (${text.slice(0, 40)}…)`
            );
        }
        return claimed;
    } catch (err) {
        console.error('[wa-dedup] Claim testo identico fallito (fail-open):', err);
        return true;
    }
}
