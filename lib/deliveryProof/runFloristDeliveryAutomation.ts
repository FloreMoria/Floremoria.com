import type { ChatSession } from '@/lib/chatStore';
import { ingestFloristWhatsAppPhoto } from '@/lib/deliveryProof/ingestFloristWhatsAppPhoto';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';

export function extractMetaMediaIdFromProxyUrl(mediaUrl?: string | null): string | null {
    if (!mediaUrl) return null;
    const match = mediaUrl.match(/\/api\/dashboard\/whatsapp\/media\/([^/?#]+)/);
    return match?.[1]?.trim() || null;
}

/**
 * Pipeline asincrona post-webhook: salva foto fiorista su DB/GdM e notifica l'acquirente.
 * Non blocca la risposta HTTP del webhook Meta.
 */
export async function runFloristDeliveryAutomation(input: {
    floristPhoneE164: string;
    mediaUrl?: string | null;
    caption?: string;
    sessionUserType?: ChatSession['userType'];
}): Promise<void> {
    const mediaId = extractMetaMediaIdFromProxyUrl(input.mediaUrl);
    if (!mediaId) return;

    const ingest = await ingestFloristWhatsAppPhoto({
        floristPhoneE164: input.floristPhoneE164,
        mediaId,
        caption: input.caption,
    });

    if (!ingest.ok) {
        console.info(`[delivery-automation] Ingest saltato: ${ingest.skipped}`);
        return;
    }

    if (!ingest.shouldNotify) {
        console.info(
            `[delivery-automation] Foto già notificata per ordine ${ingest.orderId}, skip invio utente`
        );
        return;
    }

    try {
        await onOrderStatusChanged(ingest.orderId, 'DELIVERING');
        console.log(
            "[delivery-automation] Notifica automatica foto e fiorista inviata per l'ordine:",
            ingest.orderId
        );
    } catch (err) {
        console.warn(
            `[delivery-automation] Notifica utente/fiorista fallita per ordine=${ingest.orderId}:`,
            err
        );
    }
}
