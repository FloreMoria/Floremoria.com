import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { getSession } from '@/lib/chatStore';
import { ensureWhatsAppDeliveryImageUrl } from '@/lib/whatsapp/deliveryImageStaging';
import {
    renderDeliveryProofCaption,
    renderGiardinoDellaMemoriaLinkMessage,
    resolvePartnerCity,
} from '@/lib/whatsapp/deliveryProofCopy';
import { logProofToDashboard } from '@/lib/whatsapp/deliveryProofDashboardLog';
import { isWithinCustomerServiceWindow } from '@/lib/whatsapp/messagingWindow';
import {
    isMetaCloudConfigured,
    normalizePhoneE164,
    sendWhatsAppImageMessage,
    sendWhatsAppTextMessage,
} from '@/lib/whatsapp/metaCloudApiClient';

export interface DeliveryProofWhatsAppInput {
    orderId: string;
    orderNumber?: string | null;
    buyerFullName?: string | null;
    customerPhone?: string | null;
    deceasedName?: string | null;
    cemeteryCity?: string | null;
    cemeteryName?: string | null;
    deliveryProvince?: string | null;
    photoAfterUrl?: string | null;
}

export interface DeliveryProofWhatsAppResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    imageMessageId?: string;
    linkMessageId?: string;
    error?: string;
}

function isBusinessWhatsAppLine(phoneE164: string): boolean {
    const businessRaw =
        process.env.WHATSAPP_BUSINESS_PHONE_E164?.trim() ||
        process.env.WHATSAPP_DISPLAY_PHONE?.trim() ||
        '+393204105305';
    const business = normalizePhoneE164(businessRaw);
    return Boolean(business && business === phoneE164);
}

/**
 * Invio nativo VERA post-consegna: foto posa + testo empatico + link Giardino della Memoria.
 */
export async function sendDeliveryProofWhatsApp(
    input: DeliveryProofWhatsAppInput
): Promise<DeliveryProofWhatsAppResult> {
    if (!isMetaCloudConfigured()) {
        console.warn('[delivery-proof-whatsapp] Meta Cloud API non configurata: invio saltato.');
        return { ok: false, skipped: 'meta_not_configured' };
    }

    const phoneE164 = normalizePhoneE164(input.customerPhone);
    if (!phoneE164) {
        console.warn(
            `[delivery-proof-whatsapp] Telefono assente/non valido ordine ${input.orderNumber || input.orderId}.`
        );
        return { ok: false, skipped: 'invalid_phone' };
    }

    if (isBusinessWhatsAppLine(phoneE164)) {
        console.warn(`[delivery-proof-whatsapp] Destinatario coincide con linea business: ${phoneE164}`);
        return { ok: false, skipped: 'recipient_is_business_line' };
    }

    if (!input.photoAfterUrl?.trim()) {
        return { ok: false, skipped: 'missing_photo' };
    }

    const partnerCity = resolvePartnerCity(input);
    const deceasedName = (input.deceasedName || 'chi ama').trim();
    const buyerName = (input.buyerFullName || 'Utente').trim();
    const giardinoUrl = await buildProofFotoAccessUrl(input.orderId, input.orderNumber);

    const caption = renderDeliveryProofCaption({
        buyerFullName: input.buyerFullName,
        partnerCity,
        deceasedName,
    });
    const linkMessage = renderGiardinoDellaMemoriaLinkMessage(giardinoUrl);

    try {
        const publicImageUrl = await ensureWhatsAppDeliveryImageUrl(input.orderId, input.photoAfterUrl);
        const sessionPhone = `whatsapp:${phoneE164}`;
        const session = await getSession(sessionPhone);
        const withinWindow = isWithinCustomerServiceWindow(session);

        let imageMessageId: string | undefined;
        let linkMessageId: string | undefined;

        if (withinWindow) {
            const imageSend = await sendWhatsAppImageMessage(phoneE164, publicImageUrl, caption);
            if (!imageSend.ok) {
                return {
                    ok: false,
                    skipped: 'image_send_failed',
                    giardinoUrl,
                    error: imageSend.error,
                };
            }
            imageMessageId = imageSend.messageId;

            const linkSend = await sendWhatsAppTextMessage(phoneE164, linkMessage);
            if (!linkSend.ok) {
                return {
                    ok: false,
                    skipped: 'link_send_failed',
                    giardinoUrl,
                    imageMessageId,
                    error: linkSend.error,
                };
            }
            linkMessageId = linkSend.messageId;
        } else {
            // Fuori finestra 24h: testo con link (template multimediale dedicato in fase 2 Meta).
            const combined = `${caption}\n\n${linkMessage}`;
            const textSend = await sendWhatsAppTextMessage(phoneE164, combined);
            if (!textSend.ok) {
                console.warn(
                    '[delivery-proof-whatsapp] Fuori finestra 24h: testo non inviato. Configurare template Meta dedicato.',
                    textSend.error
                );
                return {
                    ok: false,
                    skipped: 'outside_24h_window',
                    giardinoUrl,
                    error: textSend.error,
                };
            }
            linkMessageId = textSend.messageId;
        }

        const logBody = withinWindow
            ? `${caption}\n\n[Immagine consegna]\n\n${linkMessage}`
            : `${caption}\n\n${linkMessage}`;

        await logProofToDashboard(phoneE164, buyerName, logBody, {
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            buyerFullName: input.buyerFullName,
        });

        console.info(
            `[delivery-proof-whatsapp] Inviato ordine ${input.orderNumber || input.orderId} window=${withinWindow ? 'open' : 'closed'}`
        );

        return { ok: true, giardinoUrl, imageMessageId, linkMessageId };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[delivery-proof-whatsapp] Errore ordine ${input.orderNumber || input.orderId}:`, msg);
        return { ok: false, skipped: 'send_failed', error: msg };
    }
}
