import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { addMessage, getSession } from '@/lib/chatStore';
import { ensureWhatsAppDeliveryImageUrl } from '@/lib/whatsapp/deliveryImageStaging';
import {
    renderDeliveryProofCaption,
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
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import {
    isMetaCloudConfigured,
    normalizePhoneE164,
    sendWhatsAppImageMessage,
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
    /** Retrocompat: singola foto consegna. */
    photoAfterUrl?: string | null;
    /** Tutte le foto dalla mini-app (prima + dopo), prioritarie rispetto a photoAfterUrl. */
    photoAfterUrls?: string[] | null;
}

export interface DeliveryProofWhatsAppResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    imageMessageId?: string;
    linkMessageId?: string;
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

function resolveAfterPhotoUrls(input: DeliveryProofWhatsAppInput): string[] {
    const fromList = (input.photoAfterUrls || [])
        .map((u) => (u || '').trim())
        .filter(Boolean);
    if (fromList.length > 0) {
        return [...new Set(fromList)];
    }
    const single = input.photoAfterUrl?.trim();
    return single ? [single] : [];
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invio nativo VERA post-consegna: TUTTE le foto di posa + testo empatico + link Giardino.
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

    const photoUrls = resolveAfterPhotoUrls(input);
    if (photoUrls.length === 0) {
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
        const publicImageUrls: string[] = [];
        for (let i = 0; i < photoUrls.length; i += 1) {
            const publicUrl = await ensureWhatsAppDeliveryImageUrl(
                `${input.orderId}-after-${i}`,
                photoUrls[i]!
            );
            if (!/^https:\/\//i.test(publicUrl)) {
                console.error('[delivery-proof-whatsapp] URL immagine non HTTPS pubblico:', publicUrl);
                return { ok: false, skipped: 'invalid_image_url', error: 'image_url_not_https', giardinoUrl };
            }
            publicImageUrls.push(publicUrl);
        }

        console.info('[delivery-proof-whatsapp] URL immagini per Meta:', {
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            count: publicImageUrls.length,
        });

        const sessionPhone = `whatsapp:${phoneE164}`;
        const session = await getSession(sessionPhone);
        let withinWindow = isWithinCustomerServiceWindow(session);

        let imageMessageId: string | undefined;
        let linkMessageId: string | undefined;
        let photosSent = 0;

        if (!withinWindow) {
            // Fuori finestra: prima foto via template (apre il thread), poi le altre in free-text.
            const buyerFirstName = extractBuyerFirstName(buyerName) || 'Cliente';
            const bodyParams = buildCustomerDeliveryPhotoParams({
                buyerFirstName,
                partnerCity,
                deceasedName,
            });
            const templateSend = await sendVeraTemplate(
                phoneE164,
                'customer_delivery_photo',
                bodyParams,
                {
                    headerImageUrl: publicImageUrls[0]!,
                    orderId: input.orderId,
                    orderNumber: input.orderNumber,
                    skipOrderDedup: true,
                }
            );

            if (!templateSend.ok) {
                console.error('[delivery-proof-whatsapp] Template foto fuori finestra 24h fallito:', {
                    orderId: input.orderId,
                    error: templateSend.error,
                    imageUrl: publicImageUrls[0],
                    bodyParams,
                });
                return {
                    ok: false,
                    skipped: 'template_send_failed',
                    giardinoUrl,
                    error: templateSend.error ?? 'customer_delivery_photo_failed',
                };
            }

            imageMessageId = templateSend.messageId;
            photosSent = 1;
            withinWindow = true;

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

            // Foto successive (2..N) come messaggi immagine distinti.
            for (let i = 1; i < publicImageUrls.length; i += 1) {
                await sleep(800);
                const imageSend = await sendWhatsAppImageMessage(
                    phoneE164,
                    publicImageUrls[i]!,
                    undefined
                );
                if (!imageSend.ok) {
                    console.error('[delivery-proof-whatsapp] Invio foto aggiuntiva fallito:', {
                        orderId: input.orderId,
                        index: i,
                        error: imageSend.error,
                    });
                    return {
                        ok: false,
                        skipped: 'image_send_failed',
                        giardinoUrl,
                        photosSent,
                        error: imageSend.error,
                        imageMessageId,
                    };
                }
                imageMessageId = imageSend.messageId;
                photosSent += 1;
                await addMessage(
                    sessionPhone,
                    'OUTBOUND',
                    `Foto consegna (${i + 1}/${publicImageUrls.length})`,
                    publicImageUrls[i],
                    {
                        eventType: 'PROOF_OF_DELIVERY',
                        orderId: input.orderId,
                        ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
                        outboundMode: 'delivery_proof_photo',
                        ...buildOutboundWamidMetadata(imageSend.messageId),
                    }
                );
            }

            const linkSend = await sendWhatsAppMessage(phoneE164, linkMessage, {
                recipientName: buyerName,
                orderCode: input.orderNumber || undefined,
                userType: 'UTENTE',
                source: 'delivery_proof',
                sessionPhone,
            });
            if (linkSend.ok) linkMessageId = linkSend.messageId;

            await logProofToDashboard(
                phoneE164,
                buyerName,
                `[Template Meta customer_delivery_photo inviato]\n\n${linkMessage}`,
                {
                    orderId: input.orderId,
                    orderNumber: input.orderNumber,
                    buyerFullName: input.buyerFullName,
                    mediaUrl: publicImageUrls[0],
                }
            );
        } else {
            // Finestra aperta: ogni foto è un messaggio distinto; caption+link sulla prima.
            for (let i = 0; i < publicImageUrls.length; i += 1) {
                if (i > 0) await sleep(800);
                const isFirst = i === 0;
                const isLast = i === publicImageUrls.length - 1;
                let captionForPhoto: string | undefined;
                if (isFirst && publicImageUrls.length === 1) {
                    captionForPhoto = `${caption}\n\n${linkMessage}`;
                } else if (isFirst) {
                    captionForPhoto = caption;
                } else if (isLast) {
                    captionForPhoto = linkMessage;
                }

                const imageSend = await sendWhatsAppImageMessage(
                    phoneE164,
                    publicImageUrls[i]!,
                    captionForPhoto
                );
                if (!imageSend.ok) {
                    console.error('[delivery-proof-whatsapp] Invio immagine fallito:', {
                        orderId: input.orderId,
                        index: i,
                        error: imageSend.error,
                        imageUrl: publicImageUrls[i],
                    });
                    return {
                        ok: false,
                        skipped: 'image_send_failed',
                        giardinoUrl,
                        photosSent,
                        error: imageSend.error,
                        imageMessageId,
                    };
                }

                imageMessageId = imageSend.messageId;
                if (isLast) linkMessageId = imageSend.messageId;
                photosSent += 1;

                await addMessage(
                    sessionPhone,
                    'OUTBOUND',
                    captionForPhoto || `Foto consegna (${i + 1}/${publicImageUrls.length})`,
                    publicImageUrls[i],
                    {
                        eventType: 'PROOF_OF_DELIVERY',
                        orderId: input.orderId,
                        ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
                        outboundMode: 'delivery_proof_photo',
                        ...buildOutboundWamidMetadata(imageSend.messageId),
                    }
                );
            }

            // Se più foto: link già sulla ultima caption. Se una sola: già inclusa.
            // Nessun messaggio testo extra.
            await logProofToDashboard(phoneE164, buyerName, `${caption}\n\n${linkMessage}`, {
                orderId: input.orderId,
                orderNumber: input.orderNumber,
                buyerFullName: input.buyerFullName,
                mediaUrl: publicImageUrls[0],
            });
        }

        console.info(
            `[delivery-proof-whatsapp] Inviato ordine ${input.orderNumber || input.orderId} photos=${photosSent} window=${withinWindow ? 'open' : 'closed'}`
        );

        return {
            ok: true,
            giardinoUrl,
            imageMessageId,
            linkMessageId,
            photosSent,
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[delivery-proof-whatsapp] Errore ordine ${input.orderNumber || input.orderId}:`, msg);
        return { ok: false, skipped: 'send_failed', error: msg };
    }
}
