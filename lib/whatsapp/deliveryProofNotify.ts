import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { buildCustomerGardenAccessUrl } from '@/lib/memoryGarden/customerGardenUrl';
import { getSession } from '@/lib/chatStore';
import {
    renderDeliveryConfirmationFreeText,
    resolvePartnerCity,
    extractBuyerFirstName,
} from '@/lib/whatsapp/deliveryProofCopy';
import { isWithinCustomerServiceWindow } from '@/lib/whatsapp/messagingWindow';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import {
    buildCustomerDeliveryPhotoParams,
    buildCustomerDeliveryPhotoHeaderParams,
} from '@/lib/whatsapp/veraTemplateParams';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { wasOrderTemplateSent } from '@/lib/vera/orderWorkflow/orderOutboundDedup';
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
    /**
     * Solo reinvio esplicito staff: bypass dedup 24h.
     * Il flusso normale usa dedup + claim workflow (anti doppio messaggio).
     */
    forceResend?: boolean;
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
 * Punto E — un solo messaggio WhatsApp al cliente:
 * template Meta `floremoria_consegna_foto_utente` (o fallback free-text nella finestra 24h).
 * Mapping ufficiale: {{1}} nome · {{2}} città/cimitero · {{3}} defunto · {{4}} URL GdM.
 * Nessun secondo outbound, nessun prefisso debug in chat.
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
    const garden = await buildCustomerGardenAccessUrl(input.orderId, input.orderNumber);
    const giardinoUrl = garden.url;
    // Mantieni anche il codice corto /f/{code} attivo per accesso rapido 24h.
    await buildProofFotoAccessUrl(input.orderId, input.orderNumber).catch(() => undefined);
    const sessionPhone = `whatsapp:${phoneE164}`;
    const headerTextParams = buildCustomerDeliveryPhotoHeaderParams(partnerCity);

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
                headerTextParams,
                // Dedup attivo di default: un solo template per ordine / 24h.
                skipOrderDedup: Boolean(input.forceResend),
            }
        );

        if (!templateSend.ok) {
            if (templateSend.errorCode === 409 || templateSend.error?.startsWith('duplicate_prevented')) {
                const alreadyLogged = await wasOrderTemplateSent(
                    input.orderId,
                    'customer_delivery_photo',
                    input.orderNumber
                );
                if (alreadyLogged) {
                    console.info(
                        '[delivery-proof-whatsapp] Template già inviato (dedup verificato): nessun secondo messaggio.',
                        { orderId: input.orderId }
                    );
                    return {
                        ok: true,
                        skipped: 'duplicate_prevented',
                        giardinoUrl,
                        photosSent: 0,
                    };
                }
                console.warn(
                    '[delivery-proof-whatsapp] Dedup bloccato invio ma nessun outbound in chat — retry consentito.',
                    { orderId: input.orderId }
                );
            }

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
            const fallbackText = renderDeliveryConfirmationFreeText({
                buyerFullName: buyerName,
                partnerCity,
                deceasedName,
                giardinoUrl,
            });
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
            // sendWhatsAppMessage già registra in chat: nessun secondo log.
            return {
                ok: true,
                giardinoUrl,
                linkMessageId: linkSend.messageId,
                photosSent: 0,
            };
        }

        // Un solo outbound in dashboard = anteprima template pulita (no prefisso debug).
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
