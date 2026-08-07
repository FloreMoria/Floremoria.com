import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { addMessage, getSession } from '@/lib/chatStore';
import {
    renderGiardinoDellaMemoriaLinkMessage,
    resolvePartnerCity,
    extractBuyerFirstName,
} from '@/lib/whatsapp/deliveryProofCopy';
import { logProofToDashboard } from '@/lib/whatsapp/deliveryProofDashboardLog';
import { isWithinCustomerServiceWindow } from '@/lib/whatsapp/messagingWindow';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import { buildOrdineCompletatoParams } from '@/lib/whatsapp/veraTemplateParams';
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
    /** Retrocompat: non più inviato subito in chat (solo MagicLink). */
    photoAfterUrl?: string | null;
    photoAfterUrls?: string[] | null;
}

export interface DeliveryProofWhatsAppResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    imageMessageId?: string;
    linkMessageId?: string;
    /** Sempre 0 in questo flusso: le foto partono solo su richiesta utente. */
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
 * Punto E — sequenza invertita:
 * 1) Template Meta `ordine_completato` (dati ordine + MagicLink tutte le foto)
 * 2) Nessuna foto WhatsApp immediata (prima/dopo partono solo se l'utente chiede «Inviatemi le foto»)
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
        const bodyParams = buildOrdineCompletatoParams({
            buyerFirstName,
            deceasedName,
            partnerCity,
            magicLink: giardinoUrl,
        });

        const templateSend = await sendVeraTemplate(phoneE164, 'ordine_completato', bodyParams, {
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            skipOrderDedup: true,
        });

        if (!templateSend.ok) {
            // Fallback: free-text con MagicLink se la finestra 24h è aperta.
            const session = await getSession(sessionPhone);
            if (!isWithinCustomerServiceWindow(session)) {
                console.error('[delivery-proof-whatsapp] Template ordine_completato fallito fuori finestra:', {
                    orderId: input.orderId,
                    error: templateSend.error,
                });
                return {
                    ok: false,
                    skipped: 'template_send_failed',
                    giardinoUrl,
                    error: templateSend.error ?? 'ordine_completato_failed',
                    photosSent: 0,
                };
            }

            console.warn(
                '[delivery-proof-whatsapp] Template ordine_completato fallito — fallback free-text MagicLink:',
                templateSend.error
            );
            const fallbackText =
                `Gentile ${buyerFirstName}, abbiamo completato la consegna dei Suoi fiori a ${partnerCity} ` +
                `nel ricordo di ${deceasedName}.\n\n${linkMessage}`;
            const linkSend = await sendWhatsAppMessage(phoneE164, fallbackText, {
                recipientName: buyerName,
                orderCode: input.orderNumber || undefined,
                userType: 'UTENTE',
                source: 'delivery_proof_ordine_completato_fallback',
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
            templateId: 'ordine_completato',
            bodyParams,
            eventType: 'ORDINE_COMPLETATO_TEMPLATE',
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            messageId: templateSend.messageId,
            contactName: buyerName,
            userType: 'UTENTE',
        });

        // CTA in free-text se finestra aperta (template già contiene MagicLink).
        const session = await getSession(sessionPhone);
        let linkMessageId: string | undefined;
        if (isWithinCustomerServiceWindow(session)) {
            const cta =
                `Può rivedere tutte le foto nel Suo Giardino della Memoria:\n${giardinoUrl}\n\n` +
                `Se desidera riceverle anche qui in chat, risponda «Inviatemi le foto» oppure «Sì» 🌹`;
            const ctaSend = await sendWhatsAppMessage(phoneE164, cta, {
                recipientName: buyerName,
                orderCode: input.orderNumber || undefined,
                userType: 'UTENTE',
                source: 'delivery_proof_photo_cta',
                sessionPhone,
            });
            if (ctaSend.ok) {
                linkMessageId = ctaSend.messageId;
                await addMessage(sessionPhone, 'OUTBOUND', cta, undefined, {
                    eventType: 'DELIVERY_PHOTO_CTA',
                    orderId: input.orderId,
                    ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
                    outboundMode: 'delivery_proof_cta',
                }).catch(() => undefined);
            }
        }

        await logProofToDashboard(
            phoneE164,
            buyerName,
            `[Template Meta ordine_completato]\n\n${linkMessage}`,
            {
                orderId: input.orderId,
                orderNumber: input.orderNumber,
                buyerFullName: input.buyerFullName,
            }
        );

        console.info(
            `[delivery-proof-whatsapp] ordine_completato OK ${input.orderNumber || input.orderId} photosSent=0 (on-demand)`
        );

        return {
            ok: true,
            giardinoUrl,
            imageMessageId: templateSend.messageId,
            linkMessageId,
            photosSent: 0,
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[delivery-proof-whatsapp] Errore ordine ${input.orderNumber || input.orderId}:`, msg);
        return { ok: false, skipped: 'send_failed', error: msg, photosSent: 0 };
    }
}
