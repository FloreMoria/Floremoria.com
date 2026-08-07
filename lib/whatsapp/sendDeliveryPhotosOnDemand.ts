/**
 * Invio on-demand delle 2 foto principali di posa (Prima / Dopo)
 * quando l'utente risponde «Sì» / «Inviatemi le foto» / «foto».
 */
import prisma from '@/lib/prisma';
import { addMessage, getSession } from '@/lib/chatStore';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';
import { ensureWhatsAppDeliveryImageUrl } from '@/lib/whatsapp/deliveryImageStaging';
import { isWithinCustomerServiceWindow } from '@/lib/whatsapp/messagingWindow';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { buildCustomerDeliveryPhotoParams } from '@/lib/whatsapp/veraTemplateParams';
import {
    extractBuyerFirstName,
    resolvePartnerCity,
} from '@/lib/whatsapp/deliveryProofCopy';
import {
    isMetaCloudConfigured,
    normalizePhoneE164,
    sendWhatsAppImageMessage,
} from '@/lib/whatsapp/metaCloudApiClient';
import { lookupLastOrderByPhone } from '@/lib/whatsapp/orderStatusInquiry';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SendDeliveryPhotosOnDemandResult {
    ok: boolean;
    skipped?: string;
    photosSent?: number;
    orderId?: string;
    error?: string;
}

/**
 * Rileva richieste esplicite di ricevere le foto in chat
 * (pulsante rapido / testo libero).
 */
export function isRequestingDeliveryPhotosInChat(message: string): boolean {
    const t = (message || '').trim().toLowerCase();
    if (!t) return false;

    // Ack corti tipici dei quick-reply template.
    if (/^(s[iì]|si+|yes|ok|okay|va bene|certo|prego|grazie.?si)$/i.test(t)) {
        return true;
    }

    return (
        /inviatemi\s+le\s+foto/i.test(t) ||
        /inviami\s+le\s+foto/i.test(t) ||
        /mandami\s+le\s+foto/i.test(t) ||
        /mandatemi\s+le\s+foto/i.test(t) ||
        /voglio\s+(vedere\s+)?le\s+foto/i.test(t) ||
        /ricevere\s+le\s+foto/i.test(t) ||
        /le\s+foto\s+(per\s+)?(favore|piacere)/i.test(t) ||
        /^(foto|le foto|foto per favore|foto please)$/i.test(t)
    );
}

async function resolveCompletedOrderForPhotos(input: {
    phoneE164: string;
    orderId?: string | null;
}): Promise<{
    id: string;
    orderNumber: string | null;
    buyerFullName: string | null;
    deceasedName: string | null;
    cemeteryCity: string | null;
    cemeteryName: string | null;
    deliveryProvince: string | null;
    before: string[];
    after: string[];
} | null> {
    if (input.orderId) {
        const order = await prisma.order.findFirst({
            where: { id: input.orderId, deletedAt: null },
            include: { deliveryProof: true, user: { select: { name: true } } },
        });
        if (order?.deliveryProof?.status === 'COMPLETED') {
            const photos = getOrderProofPhotos(order);
            return {
                id: order.id,
                orderNumber: order.orderNumber,
                buyerFullName: order.user?.name || order.buyerFullName,
                deceasedName: order.deceasedName,
                cemeteryCity: order.cemeteryCity,
                cemeteryName: order.cemeteryName,
                deliveryProvince: order.deliveryProvince,
                before: photos.before,
                after: photos.after,
            };
        }
    }

    const last = await lookupLastOrderByPhone(input.phoneE164);
    if (!last || last.deliveryProof?.status !== 'COMPLETED') return null;
    const photos = getOrderProofPhotos(last);
    return {
        id: last.id,
        orderNumber: last.orderNumber,
        buyerFullName: last.buyerFullName,
        deceasedName: last.deceasedName,
        cemeteryCity: last.cemeteryCity,
        cemeteryName: last.cemeteryName,
        deliveryProvince: last.deliveryProvince,
        before: photos.before,
        after: photos.after,
    };
}

/**
 * Invia fino a 2 foto: 1 Prima + 1 Dopo (o le disponibili).
 */
export async function sendDeliveryPhotosOnDemand(input: {
    phoneE164: string;
    orderId?: string | null;
    buyerFullName?: string | null;
}): Promise<SendDeliveryPhotosOnDemandResult> {
    if (!isMetaCloudConfigured()) {
        return { ok: false, skipped: 'meta_not_configured' };
    }

    const phoneE164 = normalizePhoneE164(input.phoneE164);
    if (!phoneE164) return { ok: false, skipped: 'invalid_phone' };

    const order = await resolveCompletedOrderForPhotos({
        phoneE164,
        orderId: input.orderId,
    });
    if (!order) {
        return { ok: false, skipped: 'no_completed_order' };
    }

    const primaryUrls = [
        order.before[0],
        order.after[0] || order.after[1],
    ].filter((u): u is string => Boolean(u?.trim()));

    // Se manca lo slot prima, manda fino a 2 "dopo".
    const urls =
        primaryUrls.length > 0
            ? primaryUrls.slice(0, 2)
            : [...order.before, ...order.after].filter(Boolean).slice(0, 2);

    if (urls.length === 0) {
        return { ok: false, skipped: 'missing_photo', orderId: order.id };
    }

    const sessionPhone = `whatsapp:${phoneE164}`;
    const session = await getSession(sessionPhone);
    const withinWindow = isWithinCustomerServiceWindow(session);
    const partnerCity = resolvePartnerCity(order);
    const buyerName = (input.buyerFullName || order.buyerFullName || 'Utente').trim();
    const buyerFirstName = extractBuyerFirstName(buyerName) || 'Cliente';

    const publicUrls: string[] = [];
    for (let i = 0; i < urls.length; i += 1) {
        const publicUrl = await ensureWhatsAppDeliveryImageUrl(
            `${order.id}-ondemand-${i}`,
            urls[i]!
        );
        if (!/^https:\/\//i.test(publicUrl)) {
            return { ok: false, skipped: 'invalid_image_url', orderId: order.id };
        }
        publicUrls.push(publicUrl);
    }

    let photosSent = 0;
    let lastMessageId: string | undefined;

    if (!withinWindow) {
        const bodyParams = buildCustomerDeliveryPhotoParams({
            buyerFirstName,
            partnerCity,
            deceasedName: order.deceasedName,
        });
        const templateSend = await sendVeraTemplate(
            phoneE164,
            'customer_delivery_photo',
            bodyParams,
            {
                headerImageUrl: publicUrls[0]!,
                orderId: order.id,
                orderNumber: order.orderNumber,
                skipOrderDedup: true,
            }
        );
        if (!templateSend.ok) {
            return {
                ok: false,
                skipped: 'template_send_failed',
                orderId: order.id,
                error: templateSend.error,
            };
        }
        photosSent = 1;
        lastMessageId = templateSend.messageId;
        await logVeraTemplateOutbound({
            phoneE164,
            templateId: 'customer_delivery_photo',
            bodyParams,
            eventType: 'DELIVERY_PHOTO_ON_DEMAND',
            orderId: order.id,
            orderNumber: order.orderNumber,
            messageId: templateSend.messageId,
            contactName: buyerName,
            userType: 'UTENTE',
        }).catch(() => undefined);

        for (let i = 1; i < publicUrls.length; i += 1) {
            await sleep(800);
            const imageSend = await sendWhatsAppImageMessage(phoneE164, publicUrls[i]!);
            if (!imageSend.ok) {
                return {
                    ok: false,
                    skipped: 'image_send_failed',
                    orderId: order.id,
                    photosSent,
                    error: imageSend.error,
                };
            }
            photosSent += 1;
            lastMessageId = imageSend.messageId;
            await addMessage(
                sessionPhone,
                'OUTBOUND',
                `Foto posa (${i + 1}/${publicUrls.length})`,
                publicUrls[i],
                {
                    eventType: 'PROOF_OF_DELIVERY_ON_DEMAND',
                    orderId: order.id,
                    ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
                    outboundMode: 'delivery_proof_photo_ondemand',
                    ...buildOutboundWamidMetadata(imageSend.messageId),
                }
            );
        }
    } else {
        for (let i = 0; i < publicUrls.length; i += 1) {
            if (i > 0) await sleep(800);
            const label =
                i === 0 && order.before[0]
                    ? 'Foto prima della posa'
                    : 'Foto dopo la posa';
            const imageSend = await sendWhatsAppImageMessage(
                phoneE164,
                publicUrls[i]!,
                i === 0 ? `${label} 🌹` : label
            );
            if (!imageSend.ok) {
                return {
                    ok: false,
                    skipped: 'image_send_failed',
                    orderId: order.id,
                    photosSent,
                    error: imageSend.error,
                };
            }
            photosSent += 1;
            lastMessageId = imageSend.messageId;
            await addMessage(
                sessionPhone,
                'OUTBOUND',
                label,
                publicUrls[i],
                {
                    eventType: 'PROOF_OF_DELIVERY_ON_DEMAND',
                    orderId: order.id,
                    ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
                    outboundMode: 'delivery_proof_photo_ondemand',
                    ...buildOutboundWamidMetadata(imageSend.messageId),
                }
            );
        }
    }

    console.info(
        `[delivery-photos-ondemand] OK order=${order.orderNumber || order.id} photos=${photosSent} window=${withinWindow ? 'open' : 'closed'} msg=${lastMessageId || '-'}`
    );

    return { ok: true, photosSent, orderId: order.id };
}
