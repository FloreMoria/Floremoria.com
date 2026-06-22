/**
 * POST /api/whatsapp/webhook  — Ricezione messaggi WhatsApp in entrata via Evolution API.
 * GET  /api/whatsapp/webhook  — Verifica token (handshake iniziale Evolution API).
 *
 * Flusso:
 *  1. Verifica firma Bearer (WHATSAPP_WEBHOOK_SECRET)
 *  2. Estrai phone, testo, mediaUrl dal payload Evolution API
 *  3. Ignora eventi non-messaggio (status update, gruppi, echo di messaggi inviati da noi)
 *  4. Controllo PhoneBlacklist → 200 silenzioso se bloccato
 *  5. Recupera/crea WhatsAppChatSession
 *  6. Se status = HUMAN_INTERVENTION → 200 silenzioso (operatore umano attivo)
 *  7. Registra messaggio in entrata nel DB (addMessage INBOUND)
 *  8. Escalation umana → setSessionStatus + risposta handoff + return
 *  9. generateVeraReply → risposta AI VERA
 * 10. sendEvolutionTextMessage → invio risposta via gateway
 * 11. Registra messaggio in uscita nel DB (addMessage OUTBOUND)
 *
 * Principio di robustezza: risponde sempre 200 a Evolution API (evita retry loop).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { addMessage, getSession, setSessionStatus } from '@/lib/chatStore';
import { sendEvolutionTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/evolutionApiClient';
import { generateVeraReply } from '@/lib/whatsapp/veraAiReply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Tipo payload Evolution API (semplificato) ─────────────────────────────────
interface EvolutionWebhookPayload {
    event?: string;
    data?: {
        key?: {
            remoteJid?: string; // es. "393204105305@s.whatsapp.net"
            fromMe?: boolean;
            id?: string;
        };
        message?: {
            conversation?: string;
            extendedTextMessage?: { text?: string };
            imageMessage?: { caption?: string; url?: string };
            audioMessage?: { url?: string };
            documentMessage?: { caption?: string; url?: string };
        };
        messageType?: string;
        pushName?: string;
        messageTimestamp?: number;
    };
    instance?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Verifica il segreto Bearer nel header Authorization o nella query ?hub.verify_token. */
function verifyWebhookSecret(request: NextRequest): boolean {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
    if (!secret) {
        // Se non configurato in dev, accetta tutto (log warning)
        console.warn('[wa-webhook] WHATSAPP_WEBHOOK_SECRET non configurato: accetto senza verifica.');
        return true;
    }
    const auth = request.headers.get('authorization') ?? '';
    if (auth === `Bearer ${secret}`) return true;

    // Evolution API può inviare il token come header personalizzato "apikey"
    const apiKeyHeader = request.headers.get('apikey') ?? '';
    if (apiKeyHeader === secret) return true;

    return false;
}

/** Estrae il numero E.164 dal JID WhatsApp (es. "393204105305@s.whatsapp.net" → "+393204105305"). */
function jidToPhone(jid: string): string | null {
    const number = jid.split('@')[0];
    if (!number) return null;
    return normalizePhoneE164(number);
}

/** Estrae il testo leggibile dal payload message di Evolution API. */
function extractMessageText(data: EvolutionWebhookPayload['data']): string {
    const msg = data?.message;
    if (!msg) return '';
    return (
        msg.conversation ??
        msg.extendedTextMessage?.text ??
        msg.imageMessage?.caption ??
        msg.documentMessage?.caption ??
        ''
    ).trim();
}

/** Estrae il mediaUrl se presente (immagini, audio, documenti). */
function extractMediaUrl(data: EvolutionWebhookPayload['data']): string | undefined {
    const msg = data?.message;
    if (!msg) return undefined;
    return (
        msg.imageMessage?.url ??
        msg.audioMessage?.url ??
        msg.documentMessage?.url
    );
}

// ── GET — verifica token ──────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim() || '';
    if (mode === 'subscribe' && token === secret && challenge) {
        return new NextResponse(challenge, { status: 200 });
    }

    // Evolution API non usa questa verifica: risponde 200 generico
    return NextResponse.json({ status: 'ok', service: 'VERA WhatsApp Webhook' }, { status: 200 });
}

// ── POST — ricezione messaggi ─────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
    // 1. Verifica segreto
    if (!verifyWebhookSecret(request)) {
        console.warn('[wa-webhook] Richiesta non autorizzata: firma non valida.');
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 2. Parsing payload
    let payload: EvolutionWebhookPayload;
    try {
        payload = (await request.json()) as EvolutionWebhookPayload;
    } catch {
        console.warn('[wa-webhook] Payload non parsabile come JSON.');
        return NextResponse.json({ ok: true, skipped: 'parse_error' });
    }

    const { event, data } = payload;

    // 3. Ignora eventi non-messaggio (delivery status, reaction, gruppi, etc.)
    const supportedEvents = ['messages.upsert', 'MESSAGES_UPSERT', 'message'];
    if (event && !supportedEvents.includes(event)) {
        return NextResponse.json({ ok: true, skipped: `event:${event}` });
    }

    // Ignora messaggi inviati da noi (fromMe)
    if (data?.key?.fromMe === true) {
        return NextResponse.json({ ok: true, skipped: 'fromMe' });
    }

    // 4. Estrai phone
    const remoteJid = data?.key?.remoteJid ?? '';
    if (!remoteJid || remoteJid.includes('@g.us')) {
        // @g.us = gruppo WhatsApp: non supportiamo i gruppi
        return NextResponse.json({ ok: true, skipped: 'group_or_missing_jid' });
    }

    const phoneE164 = jidToPhone(remoteJid);
    if (!phoneE164) {
        console.warn('[wa-webhook] JID non convertibile in phone E.164:', remoteJid);
        return NextResponse.json({ ok: true, skipped: 'invalid_jid' });
    }

    // Formato chiave usato nel chatStore: "whatsapp:+39XXX"
    const phoneKey = `whatsapp:${phoneE164}`;

    const messageText = extractMessageText(data);
    const mediaUrl = extractMediaUrl(data);
    const senderName = data?.pushName?.trim() || phoneE164;

    // Richiedi almeno uno dei due (testo o media)
    if (!messageText && !mediaUrl) {
        return NextResponse.json({ ok: true, skipped: 'empty_message' });
    }

    console.info(`[wa-webhook] Messaggio in entrata da ${phoneE164}: "${messageText.slice(0, 80)}"`);

    // 5. Controllo PhoneBlacklist
    const blacklisted = await prisma.phoneBlacklist.findUnique({ where: { phone: phoneE164 } });
    if (blacklisted) {
        console.info(`[wa-webhook] Numero in blacklist, silenzio: ${phoneE164}`);
        return NextResponse.json({ ok: true, skipped: 'blacklisted' });
    }

    // 6. Recupera o crea sessione
    const session = await getSession(phoneKey);

    // Aggiorna nome se Evolution API lo fornisce e la sessione lo ha ancora come numero
    if (
        senderName &&
        !senderName.startsWith('+') &&
        (session.name === phoneE164 || session.name === phoneKey)
    ) {
        const { updateSessionProfile } = await import('@/lib/chatStore');
        const initials = senderName
            .split(' ')
            .filter(Boolean)
            .map((w: string) => w[0]?.toUpperCase() ?? '')
            .slice(0, 2)
            .join('');
        await updateSessionProfile(phoneKey, {
            name: senderName,
            ...(initials ? { initials } : {}),
        });
    }

    // 7. Se operatore umano attivo: silenzio (non interrompiamo)
    if (session.status === 'HUMAN_INTERVENTION') {
        await addMessage(phoneKey, 'INBOUND', messageText || '[media]', mediaUrl);
        console.info(`[wa-webhook] HUMAN_INTERVENTION attivo per ${phoneE164}: messaggio registrato, nessuna risposta AI.`);
        return NextResponse.json({ ok: true, skipped: 'human_intervention' });
    }

    // 8. Registra messaggio in entrata
    await addMessage(phoneKey, 'INBOUND', messageText || '[media]', mediaUrl);

    // 9. Aggiorna la sessione per ottenere lo storico aggiornato
    const updatedSession = await getSession(phoneKey);

    // 10. Genera risposta VERA
    const veraResult = await generateVeraReply(messageText || '[media]', updatedSession, mediaUrl);

    // 11. Escalation umana
    if (veraResult.shouldEscalate) {
        await setSessionStatus(phoneKey, 'HUMAN_INTERVENTION');
    }

    // 12. Invia risposta via Evolution API
    const sendResult = await sendEvolutionTextMessage(phoneE164, veraResult.text);

    if (!sendResult.ok) {
        console.error(
            `[wa-webhook] Invio risposta fallito per ${phoneE164} (source: ${veraResult.source}):`,
            sendResult.error
        );
        // Registriamo comunque la risposta in DB per il log dashboard
    }

    // 13. Registra messaggio in uscita
    await addMessage(
        phoneKey,
        'OUTBOUND',
        veraResult.text,
        undefined,
        {
            source: veraResult.source,
            escalated: veraResult.shouldEscalate ? 'true' : 'false',
            ...(sendResult.messageId ? { evolutionMessageId: sendResult.messageId } : {}),
        }
    );

    console.info(
        `[wa-webhook] Risposta VERA inviata a ${phoneE164} (source: ${veraResult.source}, ` +
        `escalated: ${veraResult.shouldEscalate}, ok: ${sendResult.ok})`
    );

    return NextResponse.json({
        ok: true,
        source: veraResult.source,
        escalated: veraResult.shouldEscalate,
        sent: sendResult.ok,
    });
}
