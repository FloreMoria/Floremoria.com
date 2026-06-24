/**
 * GET  /api/whatsapp/webhook  — Verifica webhook Meta (hub.challenge).
 * POST /api/whatsapp/webhook  — Messaggi in entrata Meta Cloud API → risposta VERA AI.
 *
 * Flusso POST:
 *  1. Verifica firma X-Hub-Signature-256 (WHATSAPP_APP_SECRET)
 *  2. Parse payload Meta (object: whatsapp_business_account)
 *  3. Blacklist → silenzio
 *  4. Sessione chat + HUMAN_INTERVENTION → silenzio
 *  5. generateVeraReply → sendWhatsAppTextMessage
 *
 * Risponde sempre 200 dopo parsing valido (evita retry loop Meta).
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { addMessage, getSession, setSessionStatus } from '@/lib/chatStore';
import { normalizePhoneE164, sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';
import { generateVeraReply } from '@/lib/whatsapp/veraAiReply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        button_reply?: { title?: string };
        list_reply?: { title?: string };
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

function verifyMetaSignature(rawBody: string, signatureHeader: string, appSecret: string): boolean {
    if (!signatureHeader.startsWith('sha256=')) return false;
    const receivedHex = signatureHeader.slice('sha256='.length);
    if (!/^[0-9a-f]+$/i.test(receivedHex)) return false;

    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
    const received = Buffer.from(receivedHex, 'hex');
    if (expected.length !== received.length) return false;

    return crypto.timingSafeEqual(expected, received);
}

/** Verifica firma webhook Meta (POST). */
function verifyMetaWebhookSignature(request: NextRequest, rawBody: string): boolean {
    const appSecret =
        process.env.WHATSAPP_APP_SECRET?.trim() ||
        process.env.WHATSAPP_WEBHOOK_SECRET?.trim();

    if (!appSecret) {
        console.warn('[wa-webhook] WHATSAPP_APP_SECRET non configurato: accetto POST senza verifica (solo dev).');
        return true;
    }

    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
        console.warn('[wa-webhook] POST senza X-Hub-Signature-256.');
        return false;
    }

    return verifyMetaSignature(rawBody, signature, appSecret);
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
            return { text: msg.button?.text?.trim() ?? msg.button?.payload?.trim() ?? '' };
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
                    console.warn('[wa-webhook] from non convertibile in E.164:', from);
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

async function processIncomingWhatsAppMessage(incoming: ParsedIncomingMessage): Promise<{
    ok: boolean;
    skipped?: string;
    source?: string;
    escalated?: boolean;
    sent?: boolean;
}> {
    const { phoneE164, phoneKey, messageText, mediaUrl, senderName } = incoming;
    const inboundBody = messageText || (mediaUrl ? '[media]' : '');

    console.info(`[wa-webhook] Messaggio da ${phoneE164} (${senderName}): "${inboundBody.slice(0, 80)}"`);

    const blacklisted = await prisma.phoneBlacklist.findUnique({ where: { phone: phoneE164 } });
    if (blacklisted) {
        console.info(`[wa-webhook] Blacklist: ${phoneE164}`);
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
        await addMessage(phoneKey, 'INBOUND', inboundBody, mediaUrl);
        console.info(`[wa-webhook] HUMAN_INTERVENTION attivo per ${phoneE164}: messaggio registrato, nessuna risposta AI.`);
        return { ok: true, skipped: 'human_intervention' };
    }

    await addMessage(phoneKey, 'INBOUND', inboundBody, mediaUrl);

    const updatedSession = await getSession(phoneKey);
    const veraResult = await generateVeraReply(inboundBody, updatedSession, mediaUrl);

    if (veraResult.shouldEscalate) {
        await setSessionStatus(phoneKey, 'HUMAN_INTERVENTION');
    }

    const sendResult = await sendWhatsAppTextMessage(phoneE164, veraResult.text);

    if (!sendResult.ok) {
        console.error(
            `[wa-webhook] Invio risposta fallito per ${phoneE164} (source: ${veraResult.source}):`,
            sendResult.error
        );
    }

    await addMessage(phoneKey, 'OUTBOUND', veraResult.text, undefined, {
        source: veraResult.source,
        escalated: veraResult.shouldEscalate ? 'true' : 'false',
        ...(sendResult.messageId ? { whatsAppMessageId: sendResult.messageId } : {}),
    });

    console.info(
        `[wa-webhook] VERA → ${phoneE164} (source: ${veraResult.source}, escalated: ${veraResult.shouldEscalate}, sent: ${sendResult.ok})`
    );

    return {
        ok: true,
        source: veraResult.source,
        escalated: veraResult.shouldEscalate,
        sent: sendResult.ok,
    };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim() || '';

    if (mode === 'subscribe' && challenge) {
        if (!secret || token !== secret) {
            console.warn('[wa-webhook] Verifica Meta fallita: verify_token non valido.');
            return new NextResponse('Forbidden', { status: 403 });
        }
        return new NextResponse(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    return NextResponse.json({ status: 'ok', service: 'VERA WhatsApp Webhook (Meta Cloud API)' });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const rawBody = await request.text();

    if (!verifyMetaWebhookSignature(request, rawBody)) {
        console.warn('[wa-webhook] POST non autorizzato: firma Meta non valida.');
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let payload: MetaWebhookPayload;
    try {
        payload = JSON.parse(rawBody) as MetaWebhookPayload;
    } catch {
        console.warn('[wa-webhook] Payload JSON non valido.');
        return NextResponse.json({ ok: true, skipped: 'parse_error' });
    }

    if (payload.object !== 'whatsapp_business_account') {
        return NextResponse.json({ ok: true, skipped: 'unsupported_object' });
    }

    const incomingMessages = parseMetaIncomingMessages(payload);
    if (!incomingMessages.length) {
        return NextResponse.json({ ok: true, skipped: 'no_messages' });
    }

    const results = [];
    for (const incoming of incomingMessages) {
        results.push(await processIncomingWhatsAppMessage(incoming));
    }

    return NextResponse.json({ ok: true, provider: 'meta', processed: results.length, results });
}
