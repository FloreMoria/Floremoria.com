/**
 * POST /api/whatsapp/webhook  — Ricezione messaggi WhatsApp in entrata.
 * GET  /api/whatsapp/webhook  — Verifica token (handshake Meta Cloud API).
 *
 * Supporta due sorgenti payload:
 *  - Meta Cloud API (object: whatsapp_business_account)
 *  - Evolution API (event: messages.upsert / MESSAGES_UPSERT / message)
 *
 * Flusso comune:
 *  1. Verifica firma (X-Hub-Signature-256 Meta, Bearer/apikey Evolution)
 *  2. Estrai phone, testo, mediaUrl
 *  3. Controllo PhoneBlacklist → 200 silenzioso se bloccato
 *  4. Recupera/crea WhatsAppChatSession
 *  5. Se status = HUMAN_INTERVENTION → 200 silenzioso (operatore umano attivo)
 *  6. Registra messaggio in entrata nel DB (addMessage INBOUND)
 *  7. generateVeraReply → risposta AI VERA
 *  8. sendEvolutionTextMessage → invio risposta (Meta Cloud o Evolution)
 *  9. Registra messaggio in uscita nel DB (addMessage OUTBOUND)
 *
 * Principio di robustezza: risponde 200 ai provider dopo parsing (evita retry loop).
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { addMessage, getSession, setSessionStatus } from '@/lib/chatStore';
import { sendEvolutionTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/evolutionApiClient';
import { generateVeraReply } from '@/lib/whatsapp/veraAiReply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Tipi payload ────────────────────────────────────────────────────────────────

interface EvolutionWebhookPayload {
    event?: string;
    data?: {
        key?: {
            remoteJid?: string;
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

interface MetaWebhookMessage {
    from?: string;
    id?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    image?: { caption?: string; id?: string };
    audio?: { id?: string };
    document?: { caption?: string; id?: string };
    video?: { caption?: string; id?: string };
    sticker?: { id?: string };
    interactive?: {
        type?: string;
        button_reply?: { id?: string; title?: string };
        list_reply?: { id?: string; title?: string; description?: string };
    };
    button?: { text?: string; payload?: string };
}

interface MetaWebhookPayload {
    object?: string;
    entry?: Array<{
        changes?: Array<{
            field?: string;
            value?: {
                messages?: MetaWebhookMessage[];
                statuses?: unknown[];
                contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
            };
        }>;
    }>;
}

interface ParsedIncomingMessage {
    phoneE164: string;
    phoneKey: string;
    messageText: string;
    mediaUrl?: string;
    senderName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function verifyMetaSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
    if (!signatureHeader.startsWith('sha256=')) return false;
    const receivedHex = signatureHeader.slice('sha256='.length);
    if (!/^[0-9a-f]+$/i.test(receivedHex)) return false;

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const received = Buffer.from(receivedHex, 'hex');
    if (expected.length !== received.length) return false;

    return crypto.timingSafeEqual(expected, received);
}

/** Verifica firma Meta (X-Hub-Signature-256) o token Bearer/apikey Evolution. */
function verifyWebhookSecret(request: NextRequest, rawBody?: string): boolean {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || secret;

    if (!secret && !appSecret) {
        console.warn('[wa-webhook] WHATSAPP_WEBHOOK_SECRET non configurato: accetto senza verifica.');
        return true;
    }

    const signature = request.headers.get('x-hub-signature-256');
    if (signature && rawBody && appSecret) {
        if (verifyMetaSignature(rawBody, signature, appSecret)) return true;
    }

    if (secret) {
        const auth = request.headers.get('authorization') ?? '';
        if (auth === `Bearer ${secret}`) return true;

        const apiKeyHeader = request.headers.get('apikey') ?? '';
        if (apiKeyHeader === secret) return true;
    }

    return false;
}

function metaMediaProxyUrl(mediaId: string): string {
    return `/api/admin/whatsapp/media/${mediaId}`;
}

function extractMetaMessageContent(msg: MetaWebhookMessage): { text: string; mediaUrl?: string } {
    switch (msg.type) {
        case 'text':
            return { text: msg.text?.body?.trim() ?? '' };
        case 'image':
            return {
                text: msg.image?.caption?.trim() ?? '',
                mediaUrl: msg.image?.id ? metaMediaProxyUrl(msg.image.id) : undefined,
            };
        case 'audio':
            return {
                text: '',
                mediaUrl: msg.audio?.id ? metaMediaProxyUrl(msg.audio.id) : undefined,
            };
        case 'document':
            return {
                text: msg.document?.caption?.trim() ?? '',
                mediaUrl: msg.document?.id ? metaMediaProxyUrl(msg.document.id) : undefined,
            };
        case 'video':
            return {
                text: msg.video?.caption?.trim() ?? '',
                mediaUrl: msg.video?.id ? metaMediaProxyUrl(msg.video.id) : undefined,
            };
        case 'sticker':
            return {
                text: '[sticker]',
                mediaUrl: msg.sticker?.id ? metaMediaProxyUrl(msg.sticker.id) : undefined,
            };
        case 'interactive': {
            const reply =
                msg.interactive?.button_reply?.title?.trim() ??
                msg.interactive?.list_reply?.title?.trim() ??
                '';
            return { text: reply };
        }
        case 'button':
            return {
                text: msg.button?.text?.trim() ?? msg.button?.payload?.trim() ?? '',
            };
        default:
            return { text: msg.type ? `[${msg.type}]` : '' };
    }
}

function parseMetaIncomingMessages(payload: MetaWebhookPayload): ParsedIncomingMessage[] {
    if (payload.object !== 'whatsapp_business_account') return [];

    const results: ParsedIncomingMessage[] = [];

    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            if (change.field !== 'messages') continue;

            const value = change.value;
            const messages = value?.messages;
            if (!messages?.length) continue;

            const contactName = value?.contacts?.find((c) => c.profile?.name)?.profile?.name?.trim();

            for (const msg of messages) {
                const from = msg.from?.trim();
                if (!from) continue;

                const phoneE164 = normalizePhoneE164(from);
                if (!phoneE164) {
                    console.warn('[wa-webhook] Meta from non convertibile in E.164:', from);
                    continue;
                }

                const { text, mediaUrl } = extractMetaMessageContent(msg);
                if (!text && !mediaUrl) continue;

                results.push({
                    phoneE164,
                    phoneKey: `whatsapp:${phoneE164}`,
                    messageText: text,
                    mediaUrl,
                    senderName: contactName || phoneE164,
                });
            }
        }
    }

    return results;
}

function jidToPhone(jid: string): string | null {
    const number = jid.split('@')[0];
    if (!number) return null;
    return normalizePhoneE164(number);
}

function extractEvolutionMessageText(data: EvolutionWebhookPayload['data']): string {
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

function extractEvolutionMediaUrl(data: EvolutionWebhookPayload['data']): string | undefined {
    const msg = data?.message;
    if (!msg) return undefined;
    return msg.imageMessage?.url ?? msg.audioMessage?.url ?? msg.documentMessage?.url;
}

function parseEvolutionIncomingMessage(payload: EvolutionWebhookPayload): ParsedIncomingMessage | null {
    const { event, data } = payload;

    const supportedEvents = ['messages.upsert', 'MESSAGES_UPSERT', 'message'];
    if (event && !supportedEvents.includes(event)) return null;

    if (data?.key?.fromMe === true) return null;

    const remoteJid = data?.key?.remoteJid ?? '';
    if (!remoteJid || remoteJid.includes('@g.us')) return null;

    const phoneE164 = jidToPhone(remoteJid);
    if (!phoneE164) {
        console.warn('[wa-webhook] JID non convertibile in phone E.164:', remoteJid);
        return null;
    }

    const messageText = extractEvolutionMessageText(data);
    const mediaUrl = extractEvolutionMediaUrl(data);
    if (!messageText && !mediaUrl) return null;

    return {
        phoneE164,
        phoneKey: `whatsapp:${phoneE164}`,
        messageText,
        mediaUrl,
        senderName: data?.pushName?.trim() || phoneE164,
    };
}

async function processIncomingWhatsAppMessage(incoming: ParsedIncomingMessage): Promise<{
    ok: boolean;
    skipped?: string;
    source?: string;
    escalated?: boolean;
    sent?: boolean;
}> {
    const { phoneE164, phoneKey, messageText, mediaUrl, senderName } = incoming;

    console.info(`[wa-webhook] Messaggio in entrata da ${phoneE164}: "${messageText.slice(0, 80)}"`);

    const blacklisted = await prisma.phoneBlacklist.findUnique({ where: { phone: phoneE164 } });
    if (blacklisted) {
        console.info(`[wa-webhook] Numero in blacklist, silenzio: ${phoneE164}`);
        return { ok: true, skipped: 'blacklisted' };
    }

    const session = await getSession(phoneKey);

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

    if (session.status === 'HUMAN_INTERVENTION') {
        await addMessage(phoneKey, 'INBOUND', messageText || '[media]', mediaUrl);
        console.info(`[wa-webhook] HUMAN_INTERVENTION attivo per ${phoneE164}: messaggio registrato, nessuna risposta AI.`);
        return { ok: true, skipped: 'human_intervention' };
    }

    await addMessage(phoneKey, 'INBOUND', messageText || '[media]', mediaUrl);

    const updatedSession = await getSession(phoneKey);
    const veraResult = await generateVeraReply(messageText || '[media]', updatedSession, mediaUrl);

    if (veraResult.shouldEscalate) {
        await setSessionStatus(phoneKey, 'HUMAN_INTERVENTION');
    }

    const sendResult = await sendEvolutionTextMessage(phoneE164, veraResult.text);

    if (!sendResult.ok) {
        console.error(
            `[wa-webhook] Invio risposta fallito per ${phoneE164} (source: ${veraResult.source}):`,
            sendResult.error
        );
    }

    await addMessage(phoneKey, 'OUTBOUND', veraResult.text, undefined, {
        source: veraResult.source,
        escalated: veraResult.shouldEscalate ? 'true' : 'false',
        ...(sendResult.messageId ? { evolutionMessageId: sendResult.messageId } : {}),
    });

    console.info(
        `[wa-webhook] Risposta VERA inviata a ${phoneE164} (source: ${veraResult.source}, ` +
            `escalated: ${veraResult.shouldEscalate}, ok: ${sendResult.ok})`
    );

    return {
        ok: true,
        source: veraResult.source,
        escalated: veraResult.shouldEscalate,
        sent: sendResult.ok,
    };
}

// ── GET — verifica webhook Meta (hub.challenge) ───────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim() || '';

    if (mode === 'subscribe' && challenge) {
        if (!secret || token !== secret) {
            console.warn('[wa-webhook] Verifica Meta fallita: secret assente o verify_token non valido.');
            return new NextResponse('Forbidden', { status: 403 });
        }
        return new NextResponse(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    return NextResponse.json({ status: 'ok', service: 'VERA WhatsApp Webhook' }, { status: 200 });
}

// ── POST — ricezione messaggi ─────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
    const rawBody = await request.text();

    if (!verifyWebhookSecret(request, rawBody)) {
        console.warn('[wa-webhook] Richiesta non autorizzata: firma non valida.');
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let payload: MetaWebhookPayload & EvolutionWebhookPayload;
    try {
        payload = JSON.parse(rawBody) as MetaWebhookPayload & EvolutionWebhookPayload;
    } catch {
        console.warn('[wa-webhook] Payload non parsabile come JSON.');
        return NextResponse.json({ ok: true, skipped: 'parse_error' });
    }

    // Meta Cloud API
    if (payload.object === 'whatsapp_business_account') {
        const incomingMessages = parseMetaIncomingMessages(payload);
        if (!incomingMessages.length) {
            return NextResponse.json({ ok: true, skipped: 'meta_no_messages' });
        }

        const results = [];
        for (const incoming of incomingMessages) {
            results.push(await processIncomingWhatsAppMessage(incoming));
        }

        return NextResponse.json({
            ok: true,
            provider: 'meta',
            processed: results.length,
            results,
        });
    }

    // Evolution API (retrocompatibile)
    const incoming = parseEvolutionIncomingMessage(payload);
    if (!incoming) {
        const event = payload.event ?? 'unknown';
        return NextResponse.json({ ok: true, skipped: `event:${event}` });
    }

    const result = await processIncomingWhatsAppMessage(incoming);
    return NextResponse.json({ provider: 'evolution', ...result });
}
