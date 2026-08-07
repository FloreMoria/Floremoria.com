import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { getSession } from '@/lib/chatStore';
import {
    renderGiardinoDellaMemoriaLinkMessage,
    resolvePartnerCity,
    extractBuyerFirstName,
} from '@/lib/whatsapp/deliveryProofCopy';
import { logProofToDashboard } from '@/lib/whatsapp/deliveryProofDashboardLog';
import { isWithinCustomerServiceWindow } from '@/lib/whatsapp/messagingWindow';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import { buildCustomerDeliveryPhotoParams } from '@/lib/whatsapp/veraTemplateParams';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import {
    isMetaCloudConfigured,
    normalizePhoneE164,
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
    /** Non inviato a freddo: solo MagicLink nel template (evita Meta 131047). */
    photoAfterUrl?: string | null;
    photoAfterUrls?: string[] | null;
}

export interface DeliveryProofWhatsAppResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    imageMessageId?: string;
    linkMessageId?: string;
    /** Sempre 0 qui: le foto partono solo su risposta Sì dell'utente. */
    photosSent?: number;
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
 * Punto E — template primario Meta `floremoria_consegna_foto_utente`:
 * {{1}} nome · {{2}} comune/cimitero · {{3}} defunto · {{4}} MagicLink
 * Nessuna foto WhatsApp immediata (anti-131047 fuori finestra 24h).
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

    const partnerCity = resolvePartnerCity(input);
    const deceasedName = (input.deceasedName || 'chi ama').trim();
    const buyerName = (input.buyerFullName || 'Utente').trim();
    const buyerFirstName = extractBuyerFirstName(buyerName) || 'Cliente';
    const giardinoUrl = await buildProofFotoAccessUrl(input.orderId, input.orderNumber);
    const linkMessage = renderGiardinoDellaMemoriaLinkMessage(giardinoUrl);
    const sessionPhone = `whatsapp:${phoneE164}`;

    try {
        const bodyParams = buildCustomerDeliveryPhotoParams({
            buyerFirstName,
            partnerCity,
            deceasedName,
            magicLink: giardinoUrl,
        });

        const templateSend = await sendVeraTemplate(
            phoneE164,
            'customer_delivery_photo',
            bodyParams,
            {
                orderId: input.orderId,
                orderNumber: input.orderNumber,
                skipOrderDedup: true,
            }
        );

        if (!templateSend.ok) {
            const session = await getSession(sessionPhone);
            if (!isWithinCustomerServiceWindow(session)) {
                console.error(
                    '[delivery-proof-whatsapp] Template floremoria_consegna_foto_utente fallito fuori finestra:',
                    { orderId: input.orderId, error: templateSend.error }
                );
                return {
                    ok: false,
                    skipped: 'template_send_failed',
                    giardinoUrl,
                    error: templateSend.error ?? 'floremoria_consegna_foto_utente_failed',
                    photosSent: 0,
                };
            }

            console.warn(
                '[delivery-proof-whatsapp] Template fallito — fallback free-text MagicLink:',
                templateSend.error
            );
            const fallbackText =
                `Gentile ${buyerFirstName}, abbiamo completato la consegna dei Suoi fiori a ${partnerCity} ` +
                `nel ricordo di ${deceasedName}.\n\n${linkMessage}`;
            const linkSend = await sendWhatsAppMessage(phoneE164, fallbackText, {
                recipientName: buyerName,
                orderCode: input.orderNumber || undefined,
                userType: 'UTENTE',
                source: 'delivery_proof_consegna_foto_fallback',
                sessionPhone,
            });
            if (!linkSend.ok) {
                return {
                    ok: false,
                    skipped: 'fallback_send_failed',
                    giardinoUrl,
                    error: linkSend.error,
                    photosSent: 0,
                };
            }
            await logProofToDashboard(phoneE164, buyerName, fallbackText, {
                orderId: input.orderId,
                orderNumber: input.orderNumber,
                buyerFullName: input.buyerFullName,
            });
            return {
                ok: true,
                giardinoUrl,
                linkMessageId: linkSend.messageId,
                photosSent: 0,
            };
        }

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

        await logProofToDashboard(
            phoneE164,
            buyerName,
            `[Template Meta floremoria_consegna_foto_utente]\n\n${linkMessage}`,
            {
                orderId: input.orderId,
                orderNumber: input.orderNumber,
                buyerFullName: input.buyerFullName,
            }
        );

        console.info(
            `[delivery-proof-whatsapp] floremoria_consegna_foto_utente OK ${input.orderNumber || input.orderId} photosSent=0 (on-demand)`
        );

        return {
            ok: true,
            giardinoUrl,
            imageMessageId: templateSend.messageId,
            photosSent: 0,
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[delivery-proof-whatsapp] Errore ordine ${input.orderNumber || input.orderId}:`, msg);
        return { ok: false, skipped: 'send_failed', error: msg, photosSent: 0 };
    }
}
