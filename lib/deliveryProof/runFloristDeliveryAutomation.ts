import type { ChatSession } from '@/lib/chatStore';
import { ingestFloristWhatsAppPhoto } from '@/lib/deliveryProof/ingestFloristWhatsAppPhoto';
import { sendFloristDeliveryPhotoAck } from '@/lib/deliveryProof/sendFloristDeliveryPhotoAck';
import { extractWhatsAppMediaId } from '@/lib/whatsapp/chatMediaUrls';

/**
 * Pipeline asincrona post-webhook: salva foto fiorista su Blob/DB/GdM e conferma via WhatsApp.
 * Non blocca la risposta HTTP del webhook Meta.
 */
export async function runFloristDeliveryAutomation(input: {
    floristPhoneE164: string;
    mediaUrl?: string | null;
    caption?: string;
    sessionUserType?: ChatSession['userType'];
}): Promise<void> {
    void input.sessionUserType;

    const mediaId = extractWhatsAppMediaId(input.mediaUrl);
    if (!mediaId) {
        console.info('[delivery-automation] Skip: mediaUrl senza ID Meta Graph', {
            mediaUrl: input.mediaUrl?.slice(0, 80),
        });
        return;
    }

    const ingest = await ingestFloristWhatsAppPhoto({
        floristPhoneE164: input.floristPhoneE164,
        mediaId,
        caption: input.caption,
    });

    if (!ingest.ok) {
        console.info('[delivery-automation] Ingest saltato', {
            skipped: ingest.skipped,
            floristPhoneE164: input.floristPhoneE164,
            mediaId,
        });
        return;
    }

    await sendFloristDeliveryPhotoAck({
        floristPhoneE164: input.floristPhoneE164,
        orderNumber: ingest.orderNumber,
        mediaUrl: input.mediaUrl,
    }).catch((err) => {
        console.error('[delivery-automation] Ack fiorista non bloccante fallito:', err);
    });

    console.info('[delivery-automation] Foto associata', {
        orderId: ingest.orderId,
        orderNumber: ingest.orderNumber,
        shouldNotify: ingest.shouldNotify,
        photoAfterUrl: ingest.photoAfterUrl,
    });
}
