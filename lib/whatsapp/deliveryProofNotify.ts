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
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { buildCustomerDeliveryPhotoParams } from '@/lib/whatsapp/veraTemplateParams';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
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
        if (!/^https:\/\//i.test(publicImageUrl)) {
            console.error('[delivery-proof-whatsapp] URL immagine non HTTPS pubblico:', publicImageUrl);
            return { ok: false, skipped: 'invalid_image_url', error: 'image_url_not_https' };
        }

        console.info('[delivery-proof-whatsapp] URL immagine per Meta:', {
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            imageHost: publicImageUrl.replace(/^https?:\/\/([^/]+).*/, '$1'),
        });

        const sessionPhone = `whatsapp:${phoneE164}`;
        const session = await getSession(sessionPhone);
        const withinWindow = isWithinCustomerServiceWindow(session);

        let imageMessageId: string | undefined;
        let linkMessageId: string | undefined;

        if (withinWindow) {
            const imageSend = await sendWhatsAppImageMessage(phoneE164, publicImageUrl, caption);
            if (!imageSend.ok) {
                console.error('[delivery-proof-whatsapp] Invio immagine in finestra aperta fallito:', {
                    orderId: input.orderId,
                    error: imageSend.error,
                    imageUrl: publicImageUrl,
                });
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
            const buyerFirstName = extractFirstNameFromProfile(buyerName);
            const bodyParams = buildCustomerDeliveryPhotoParams({
                buyerFirstName,
                partnerCity,
                deceasedName,
            });
            const templateSend = await sendVeraTemplate(
                phoneE164,
                'customer_delivery_photo',
                bodyParams,
                { headerImageUrl: publicImageUrl }
            );

            if (!templateSend.ok) {
                console.error('[delivery-proof-whatsapp] Template foto fuori finestra 24h fallito:', {
                    orderId: input.orderId,
                    error: templateSend.error,
                    imageUrl: publicImageUrl,
                    bodyParams,
                });
                return {
                    ok: false,
                    skipped: 'template_send_failed',
                    giardinoUrl,
                    error: templateSend.error ?? 'customer_delivery_photo_failed',
                };
            }

            linkMessageId = templateSend.messageId;

            try {
                await logVeraTemplateOutbound({
                    phoneE164,
                    templateId: 'customer_delivery_photo',
                    bodyParams,
                    eventType: 'DELIVERY_PHOTO_TEMPLATE',
                    orderId: input.orderId,
                    orderNumber: input.orderNumber,
                    messageId: templateSend.messageId,
                    contactName: buyerName,
                    userType: 'UTENTE',
                });
            } catch (logErr) {
                console.error('[delivery-proof-whatsapp] Log dashboard template foto fallito:', logErr);
            }

            const linkSend = await sendWhatsAppTextMessage(phoneE164, linkMessage);
            if (linkSend.ok) linkMessageId = linkSend.messageId;
        }

        const logBody = withinWindow
            ? `${caption}\n\n[Immagine consegna]\n\n${linkMessage}`
            : `${caption}\n\n${linkMessage}`;

        await logProofToDashboard(phoneE164, buyerName, logBody, {
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            buyerFullName: input.buyerFullName,
            mediaUrl: publicImageUrl,
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
