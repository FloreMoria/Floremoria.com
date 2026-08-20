/**
 * Flush di un batch debounce: una sola risposta Vera all'aggregato.
 * Separato dal webhook per evitare import circolari con after/cron.
 */

import { addMessage, getSession, setSessionStatus } from '@/lib/chatStore';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';
import { generateVeraReply } from '@/lib/whatsapp/veraAiReply';
import { notifyStaffOfWhatsAppInbound } from '@/lib/push/staffPush';
import { shouldSilenceVeraReply } from '@/lib/vera/courtesyDebounce';
import { FLORIST_UNSUPPORTED_MEDIA_REPLY } from '@/lib/whatsapp/extractMetaInboundContent';
import {
    hasOutboundReplyForInboundMessageId,
    releaseVeraOutboundReplyLock,
    tryClaimVeraOutboundReplyLock,
} from '@/lib/whatsapp/veraWebhookDedup';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';

export async function flushDebouncedVeraReply(params: {
    phoneKey: string;
    outboundAddress: string;
    senderName: string;
    batchId: string;
    aggregatedBody: string;
    mediaUrl: string | null;
    mediaCount: number;
    textParts: string[];
    unsupportedMediaOnly: boolean;
    forceFloristUnsupportedMediaReply: boolean;
    lastInboundMessageId?: string;
}): Promise<{
    ok: boolean;
    skipped?: string;
    source?: string;
    sent?: boolean;
}> {
    const {
        phoneKey,
        outboundAddress,
        senderName,
        batchId,
        aggregatedBody,
        mediaUrl,
        mediaCount,
        textParts,
        unsupportedMediaOnly,
        forceFloristUnsupportedMediaReply,
        lastInboundMessageId,
    } = params;

    // Dedup: se l'ultimo wamid ha già una reply (race), non reinviare.
    if (lastInboundMessageId) {
        const already = await hasOutboundReplyForInboundMessageId(phoneKey, lastInboundMessageId);
        if (already) {
            return { ok: true, skipped: 'already_replied_to_inbound', sent: false };
        }
    }

    const syntheticInboundId = `debounce-batch:${batchId}`;
    const lock = await tryClaimVeraOutboundReplyLock({
        phoneE164: outboundAddress,
        inboundMessageId: syntheticInboundId,
        // Batch già aggregato: applica sempre phone burst (una sola reply).
        hasMedia: false,
    });
    if (!lock.ok) {
        return { ok: true, skipped: `outbound_lock_${lock.reason}`, sent: false };
    }

    const session = await getSession(phoneKey);

    if (session.status === 'HUMAN_INTERVENTION') {
        return { ok: true, skipped: 'human_intervention', sent: false };
    }

    // Solo ack cortesi / rumore senza media → silenzio.
    const joinedText = textParts.join(' ').trim() || aggregatedBody;
    if (
        mediaCount === 0 &&
        !unsupportedMediaOnly &&
        shouldSilenceVeraReply(joinedText, session)
    ) {
        console.info(`[wa-debounce] Silenzio post-batch per ${outboundAddress}`);
        return { ok: true, source: 'silence', sent: false, skipped: 'silence' };
    }

    if (
        (unsupportedMediaOnly || forceFloristUnsupportedMediaReply) &&
        session.userType === 'FLORIST' &&
        !mediaUrl
    ) {
        const reply = FLORIST_UNSUPPORTED_MEDIA_REPLY;
        const sendResult = await sendWhatsAppTextMessage(outboundAddress, reply);
        if (!sendResult.ok) {
            await releaseVeraOutboundReplyLock({
                phoneE164: outboundAddress,
                inboundMessageId: syntheticInboundId,
            });
            return { ok: true, source: 'deterministic', sent: false, skipped: 'send_failed' };
        }
        await addMessage(phoneKey, 'OUTBOUND', reply, undefined, {
            source: 'deterministic',
            eventType: 'FLORIST_UNSUPPORTED_MEDIA_GUIDANCE',
            debounceBatchId: batchId,
            ...buildOutboundWamidMetadata(sendResult.messageId),
            ...(lastInboundMessageId ? { replyToMessageId: lastInboundMessageId } : {}),
        });
        return { ok: true, source: 'deterministic', sent: true };
    }

    const veraResult = await generateVeraReply(aggregatedBody, session, mediaUrl, {
        debounceBatch: true,
        mediaCount,
        aggregatedTextParts: textParts,
    });

    if (veraResult.shouldEscalate) {
        await setSessionStatus(phoneKey, 'HUMAN_INTERVENTION');
    }

    void notifyStaffOfWhatsAppInbound({
        senderName,
        phoneE164: outboundAddress,
        messagePreview: aggregatedBody.slice(0, 200),
        userType: session.userType,
        escalated: veraResult.shouldEscalate,
    }).catch((err) => console.warn('[staff-push] notify failed:', err));

    if (veraResult.source === 'silence' || !veraResult.text.trim()) {
        return { ok: true, source: veraResult.source, sent: false, skipped: 'silence' };
    }

    const sendResult = await sendWhatsAppMessage(outboundAddress, veraResult.text, {
        recipientName: senderName,
        sessionPhone: phoneKey,
        source: veraResult.source,
    });

    if (!sendResult.ok) {
        await releaseVeraOutboundReplyLock({
            phoneE164: outboundAddress,
            inboundMessageId: syntheticInboundId,
        });
        console.error(`[wa-debounce] Invio fallito per ${outboundAddress}:`, sendResult.error);
    }

    if (!sendResult.fallbackExecuted) {
        await addMessage(phoneKey, 'OUTBOUND', veraResult.text, undefined, {
            source: veraResult.source,
            escalated: veraResult.shouldEscalate ? 'true' : 'false',
            eventType: 'VERA_AUTO_REPLY',
            debounceBatchId: batchId,
            debounceMediaCount: String(mediaCount),
            ...buildOutboundWamidMetadata(sendResult.messageId),
            ...(lastInboundMessageId ? { replyToMessageId: lastInboundMessageId } : {}),
        });
    }

    console.info(
        `[wa-debounce] Flush → ${outboundAddress} (source=${veraResult.source}, media=${mediaCount}, sent=${sendResult.ok})`
    );

    return {
        ok: true,
        source: veraResult.source,
        sent: sendResult.ok,
    };
}
