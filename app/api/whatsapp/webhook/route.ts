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
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import {
    normalizePhoneE164,
    sendWhatsAppTextMessage,
} from '@/lib/whatsapp/metaCloudApiClient';
import { generateVeraReply } from '@/lib/whatsapp/veraAiReply';
import { groupIncomingByPhone } from '@/lib/whatsapp/replyCoalesce';
import { triggerPostmanBackgroundSync } from '@/lib/postman/triggerBackgroundSync';
import { runFloristDeliveryAutomation } from '@/lib/deliveryProof/runFloristDeliveryAutomation';
import { notifyStaffOfWhatsAppInbound } from '@/lib/push/staffPush';
import { shouldSilenceVeraReply } from '@/lib/vera/courtesyDebounce';
import {
    extractMetaInboundContent,
    FLORIST_UNSUPPORTED_MEDIA_REPLY,
    type MetaInboundMediaMessage,
} from '@/lib/whatsapp/extractMetaInboundContent';
import { persistInboundChatMediaToBlob } from '@/lib/whatsapp/persistInboundChatMedia';
import {
    hasOutboundReplyForInboundMessageId,
    releaseVeraOutboundReplyLock,
    tryClaimInboundWhatsAppMessageId,
    tryClaimVeraOutboundReplyLock,
} from '@/lib/whatsapp/veraWebhookDedup';
import {
    processMetaStatusUpdate,
    type MetaWebhookStatusPayload,
} from '@/lib/whatsapp/updateWhatsAppDeliveryStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface MetaWebhookMessage extends MetaInboundMediaMessage {
    from?: string;
    id?: string;
    timestamp?: string;
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
    silenceVera?: boolean;
    /** Allegato non leggibile / tipo non foto → guida fiorista. */
    unsupportedMedia?: boolean;
    /** Meta WhatsApp message id (wamid.*) — usato per dedup retry webhook. */
    inboundMessageId?: string;
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

                const { text, mediaUrl, silenceVera, unsupportedMedia } = extractMetaInboundContent(msg);
                // Inclusi anche allegati “vuoti” non supportati (serve guida al fiorista).
                if (!text && !mediaUrl && !unsupportedMedia) continue;

                results.push({
                    phoneE164,
                    phoneKey: `whatsapp:${phoneE164}`,
                    messageText: text,
                    mediaUrl,
                    senderName: contactName || phoneE164,
                    silenceVera,
                    unsupportedMedia,
                    inboundMessageId: msg.id?.trim() || undefined,
                });
            }
        }
    }

    return results;
}

async function processIncomingWhatsAppMessage(
    incoming: ParsedIncomingMessage,
    options?: { deferReply?: boolean }
): Promise<{
    ok: boolean;
    skipped?: string;
    source?: string;
    escalated?: boolean;
    sent?: boolean;
    coalesced?: boolean;
}> {
    const {
        phoneE164,
        phoneKey,
        messageText,
        mediaUrl,
        senderName,
        silenceVera,
        unsupportedMedia,
        inboundMessageId,
    } = incoming;
    // Mai loggare testi tecnici OTP/"Tipo sconosciuto" — placeholder neutro per staff.
    const inboundBody =
        messageText ||
        (mediaUrl ? '[media]' : unsupportedMedia ? '[allegato non leggibile via API]' : '');

    console.info(`[wa-webhook] Messaggio da ${phoneE164} (${senderName}): "${inboundBody.slice(0, 80)}"`);

    // Retry Meta/Twilio: stesso wamid → non ri-processare (né reply, né doppio log inbound).
    if (inboundMessageId) {
        const claimed = await tryClaimInboundWhatsAppMessageId(inboundMessageId, phoneE164);
        if (!claimed) {
            return { ok: true, skipped: 'duplicate_inbound_message_id' };
        }
    }

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

    const inboundMeta = inboundMessageId
        ? { whatsAppMessageId: inboundMessageId }
        : undefined;

    if (session.status === 'HUMAN_INTERVENTION') {
        await addMessage(phoneKey, 'INBOUND', inboundBody, mediaUrl, inboundMeta);
        if (mediaUrl) {
            void persistInboundChatMediaToBlob({
                sessionPhone: phoneKey,
                mediaUrl,
            }).catch((err) => {
                console.warn('[chat-media] persist async failed:', err);
            });
            void runFloristDeliveryAutomation({
                floristPhoneE164: phoneE164,
                mediaUrl,
                caption: messageText,
                sessionUserType: session.userType,
            }).catch((err) => {
                console.error('[delivery-automation] Errore pipeline foto fiorista:', err);
            });
        }
        console.info(`[wa-webhook] HUMAN_INTERVENTION attivo per ${phoneE164}: messaggio registrato, nessuna risposta AI.`);
        void notifyStaffOfWhatsAppInbound({
            senderName,
            phoneE164,
            messagePreview: inboundBody,
            userType: session.userType,
            escalated: true,
        }).catch((err) => console.warn('[staff-push] notify failed:', err));
        return { ok: true, skipped: 'human_intervention' };
    }

    await addMessage(phoneKey, 'INBOUND', inboundBody, mediaUrl, inboundMeta);

    if (mediaUrl) {
        void persistInboundChatMediaToBlob({
            sessionPhone: phoneKey,
            mediaUrl,
        }).catch((err) => {
            console.warn('[chat-media] persist async failed:', err);
        });
        void runFloristDeliveryAutomation({
            floristPhoneE164: phoneE164,
            mediaUrl,
            caption: messageText,
            sessionUserType: session.userType,
        }).catch((err) => {
            console.error('[delivery-automation] Errore pipeline foto fiorista:', err);
        });
    }

    if (options?.deferReply) {
        return { ok: true, skipped: 'defer_reply' };
    }

    // Reaction / system: registra in chat, niente risposta VERA.
    if (silenceVera) {
        console.info(`[wa-webhook] VERA silenzio (tipo non conversazionale) per ${phoneE164}`);
        void notifyStaffOfWhatsAppInbound({
            senderName,
            phoneE164,
            messagePreview: inboundBody,
            userType: session.userType,
            escalated: false,
        }).catch((err) => console.warn('[staff-push] notify failed:', err));
        return { ok: true, source: 'silence', escalated: false, sent: false, skipped: 'silence_non_conversational' };
    }

    // Fiorista: file non foto (o unsupported senza media) → guida umanizzata, zero Gemini/OTP.
    if (unsupportedMedia && session.userType === 'FLORIST' && !mediaUrl) {
        return sendFloristUnsupportedMediaGuidance({
            phoneKey,
            phoneE164,
            senderName,
            inboundMessageId,
            userType: session.userType,
        });
    }

    // Documento non-immagine con mediaUrl: prova ingest; se fallisce la guida parte da VERA deterministico.
    if (unsupportedMedia && session.userType === 'FLORIST' && mediaUrl) {
        return finalizeVeraOutboundReply({
            phoneKey,
            phoneE164,
            senderName,
            inboundBody,
            mediaUrl,
            inboundMessageId,
            forceFloristUnsupportedMediaReply: true,
        });
    }

    // Utente finale con allegato non leggibile: silenzio (niente testo tecnico).
    if (unsupportedMedia && session.userType !== 'FLORIST' && !mediaUrl) {
        console.info(`[wa-webhook] Allegato non leggibile da utente ${phoneE164}: silenzio`);
        void notifyStaffOfWhatsAppInbound({
            senderName,
            phoneE164,
            messagePreview: inboundBody,
            userType: session.userType,
            escalated: false,
        }).catch((err) => console.warn('[staff-push] notify failed:', err));
        return { ok: true, source: 'silence', sent: false, skipped: 'unsupported_media_user_silence' };
    }

    return finalizeVeraOutboundReply({
        phoneKey,
        phoneE164,
        senderName,
        inboundBody,
        mediaUrl,
        inboundMessageId,
    });
}

async function sendFloristUnsupportedMediaGuidance(params: {
    phoneKey: string;
    phoneE164: string;
    senderName: string;
    inboundMessageId?: string;
    userType: string;
}): Promise<{
    ok: boolean;
    skipped?: string;
    source?: string;
    escalated?: boolean;
    sent?: boolean;
}> {
    const { phoneKey, phoneE164, senderName, inboundMessageId, userType } = params;
    const reply = FLORIST_UNSUPPORTED_MEDIA_REPLY;

    if (inboundMessageId) {
        const alreadyReplied = await hasOutboundReplyForInboundMessageId(phoneKey, inboundMessageId);
        if (alreadyReplied) {
            return { ok: true, skipped: 'already_replied_to_inbound', sent: false };
        }
    }

    const lock = await tryClaimVeraOutboundReplyLock({
        phoneE164,
        inboundMessageId,
        hasMedia: false,
    });
    if (!lock.ok) {
        return { ok: true, skipped: `outbound_lock_${lock.reason}`, sent: false };
    }

    const sendResult = await sendWhatsAppTextMessage(phoneE164, reply);
    if (!sendResult.ok) {
        await releaseVeraOutboundReplyLock({ phoneE164, inboundMessageId });
        console.error('[wa-webhook] Guida media fiorista fallita:', sendResult.error);
        return { ok: true, source: 'deterministic', sent: false, skipped: 'send_failed' };
    }

    await addMessage(phoneKey, 'OUTBOUND', reply, undefined, {
        source: 'deterministic',
        eventType: 'FLORIST_UNSUPPORTED_MEDIA_GUIDANCE',
        ...(sendResult.messageId ? { whatsAppMessageId: sendResult.messageId } : {}),
        ...(inboundMessageId ? { replyToMessageId: inboundMessageId } : {}),
    });

    void notifyStaffOfWhatsAppInbound({
        senderName,
        phoneE164,
        messagePreview: '[allegato non leggibile]',
        userType,
        escalated: false,
    }).catch((err) => console.warn('[staff-push] notify failed:', err));

    console.info(`[wa-webhook] Guida media non supportato → fiorista ${phoneE164}`);
    return { ok: true, source: 'deterministic', sent: true };
}

async function finalizeVeraOutboundReply(params: {
    phoneKey: string;
    phoneE164: string;
    senderName: string;
    inboundBody: string;
    mediaUrl?: string | null;
    inboundMessageId?: string;
    forceFloristUnsupportedMediaReply?: boolean;
}): Promise<{
    ok: boolean;
    skipped?: string;
    source?: string;
    escalated?: boolean;
    sent?: boolean;
    coalesced?: boolean;
}> {
    const {
        phoneKey,
        phoneE164,
        senderName,
        inboundBody,
        mediaUrl,
        inboundMessageId,
        forceFloristUnsupportedMediaReply,
    } = params;

    if (inboundMessageId) {
        const alreadyReplied = await hasOutboundReplyForInboundMessageId(phoneKey, inboundMessageId);
        if (alreadyReplied) {
            console.info(`[wa-webhook] Reply già presente per inbound ${inboundMessageId.slice(0, 24)}…`);
            return { ok: true, skipped: 'already_replied_to_inbound', sent: false };
        }
    }

    const updatedSession = await getSession(phoneKey);
    const lastInbound = [...updatedSession.messages].reverse().find((m) => m.direction === 'INBOUND');
    const replySeed = lastInbound?.body || inboundBody;
    const seedMedia = lastInbound?.mediaUrl || mediaUrl;

    const outboundLock = await tryClaimVeraOutboundReplyLock({
        phoneE164,
        inboundMessageId,
        // Foto inbound: no phone-burst — consente ack su foto posa sequenziali.
        hasMedia: Boolean(seedMedia),
    });
    if (!outboundLock.ok) {
        return { ok: true, skipped: `outbound_lock_${outboundLock.reason}`, sent: false };
    }

    if (shouldSilenceVeraReply(replySeed, updatedSession) && !seedMedia) {
        console.info(`[wa-webhook] VERA silenzio (post-burst) per ${phoneE164}`);
        return { ok: true, source: 'silence', escalated: false, sent: false, skipped: 'silence' };
    }

    // Documento/PDF o video: guida foto galleria (senza passare da Gemini).
    if (forceFloristUnsupportedMediaReply && updatedSession.userType === 'FLORIST') {
        const reply = FLORIST_UNSUPPORTED_MEDIA_REPLY;
        const sendResult = await sendWhatsAppMessage(phoneE164, reply, {
            recipientName: senderName,
            sessionPhone: phoneKey,
            source: 'deterministic',
        });
        if (!sendResult.ok) {
            await releaseVeraOutboundReplyLock({ phoneE164, inboundMessageId });
        } else if (!sendResult.fallbackExecuted) {
            await addMessage(phoneKey, 'OUTBOUND', reply, undefined, {
                source: 'deterministic',
                eventType: 'FLORIST_UNSUPPORTED_MEDIA_GUIDANCE',
                ...(sendResult.messageId ? { whatsAppMessageId: sendResult.messageId } : {}),
                ...(inboundMessageId ? { replyToMessageId: inboundMessageId } : {}),
            });
        }
        return {
            ok: true,
            source: 'deterministic',
            escalated: false,
            sent: sendResult.ok,
        };
    }

    const veraResult = await generateVeraReply(replySeed, updatedSession, seedMedia);

    if (veraResult.shouldEscalate) {
        await setSessionStatus(phoneKey, 'HUMAN_INTERVENTION');
    }

    void notifyStaffOfWhatsAppInbound({
        senderName,
        phoneE164,
        messagePreview: replySeed,
        userType: updatedSession.userType,
        escalated: veraResult.shouldEscalate,
    }).catch((err) => console.warn('[staff-push] notify failed:', err));

    if (veraResult.source === 'silence' || !veraResult.text.trim()) {
        console.info(`[wa-webhook] VERA silenzio per ${phoneE164} (source: ${veraResult.source})`);
        return { ok: true, source: veraResult.source, escalated: false, sent: false, skipped: 'silence' };
    }

    const sendResult = await sendWhatsAppMessage(phoneE164, veraResult.text, {
        recipientName: senderName,
        sessionPhone: phoneKey,
        source: veraResult.source,
    });

    if (!sendResult.ok) {
        console.error(
            `[wa-webhook] Invio risposta fallito per ${phoneE164} (source: ${veraResult.source}):`,
            sendResult.error
        );
        await releaseVeraOutboundReplyLock({ phoneE164, inboundMessageId });
    }

    if (!sendResult.fallbackExecuted) {
        await addMessage(phoneKey, 'OUTBOUND', veraResult.text, undefined, {
            source: veraResult.source,
            escalated: veraResult.shouldEscalate ? 'true' : 'false',
            ...(sendResult.messageId ? { whatsAppMessageId: sendResult.messageId } : {}),
            ...(inboundMessageId ? { replyToMessageId: inboundMessageId } : {}),
            eventType: 'VERA_AUTO_REPLY',
        });
    }

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

    // Processa gli aggiornamenti di stato di consegna (statuses: SENT, DELIVERED, READ, FAILED)
    let processedStatusesCount = 0;
    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            if (change.field !== 'messages') continue;
            const value = change.value as { statuses?: MetaWebhookStatusPayload[] } | undefined;
            if (value?.statuses && Array.isArray(value.statuses)) {
                for (const st of value.statuses) {
                    await processMetaStatusUpdate(st);
                    processedStatusesCount++;
                }
            }
        }
    }

    const incomingMessages = parseMetaIncomingMessages(payload);
    if (!incomingMessages.length) {
        return NextResponse.json({ ok: true, skipped: 'no_messages', processedStatuses: processedStatusesCount });
    }

    void triggerPostmanBackgroundSync();

    // Una sola reply VERA per telefono nel batch Meta (foto+caption+ok → 1 risposta).
    const results = [];
    for (const [, group] of groupIncomingByPhone(incomingMessages)) {
        for (let i = 0; i < group.length; i++) {
            const isLast = i === group.length - 1;
            results.push(
                await processIncomingWhatsAppMessage(group[i], {
                    deferReply: !isLast,
                })
            );
        }
    }

    return NextResponse.json({
        ok: true,
        provider: 'meta',
        processed: results.length,
        processedStatuses: processedStatusesCount,
        results,
    });
}
