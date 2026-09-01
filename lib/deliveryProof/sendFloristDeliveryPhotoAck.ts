import { addMessage } from '@/lib/chatStore';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';
import { toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';
import { tryClaimConversationIntent } from '@/lib/whatsapp/veraWebhookDedup';

export function buildFloristDeliveryPhotoAckText(orderCode: string): string {
    const code = orderCode.trim() || 'in corso';
    return `Grazie! Foto di consegna ricevuta e associata all'ordine ${code}.`;
}

/**
 * Conferma immediata al fiorista dopo ingest foto posa.
 * Claim intent VERA per evitare doppia risposta al flush debounce 60s.
 */
export async function sendFloristDeliveryPhotoAck(input: {
    floristPhoneE164: string;
    orderNumber: string | null;
    mediaUrl?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
    const orderCode = input.orderNumber?.trim() || '';
    const text = buildFloristDeliveryPhotoAckText(orderCode);

    if (input.mediaUrl) {
        await tryClaimConversationIntent({
            phoneE164: input.floristPhoneE164,
            intentFingerprint: `florist_pose_photo:${input.mediaUrl.slice(-48)}`,
        }).catch(() => undefined);
    }

    const sendResult = await sendWhatsAppTextMessage(input.floristPhoneE164, text);
    if (!sendResult.ok) {
        console.error('[delivery-automation] Ack fiorista fallito:', {
            floristPhoneE164: input.floristPhoneE164,
            orderCode,
            error: sendResult.error,
        });
        return { ok: false, error: sendResult.error };
    }

    const phoneKey = toWhatsAppSessionPhone(input.floristPhoneE164);
    if (phoneKey) {
        await addMessage(phoneKey, 'OUTBOUND', text, undefined, {
            source: 'deterministic',
            eventType: 'FLORIST_DELIVERY_PHOTO_ACK',
            ...buildOutboundWamidMetadata(sendResult.messageId),
        }).catch((err) => {
            console.warn('[delivery-automation] Log ack chat fallito:', err);
        });
    }

    console.info('[delivery-automation] Ack fiorista inviato', {
        floristPhoneE164: input.floristPhoneE164,
        orderCode,
    });

    return { ok: true };
}
