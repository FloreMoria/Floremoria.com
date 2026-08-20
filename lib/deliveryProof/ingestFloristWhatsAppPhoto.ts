import prisma from '@/lib/prisma';
import { ensureUserForOrder } from '@/lib/auth/ensureOrderUser';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import {
    injectDeliveryPhotosOnOrder,
    propagateDeliveryPhotosToLinkedProfiles,
} from '@/lib/deliveryProof/injectOrderDeliveryPhotos';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';
import { processProofImageBuffer } from '@/lib/deliveryProof/processProofImage';
import { triggerSocialSanitizationForOrder } from '@/lib/deliveryProof/triggerSocialSanitization';
import { uniqueAppendPhotoUrls } from '@/lib/deliveryProof/uniqueAppendPhotoUrls';
import { resolveOrderByPublicRef } from '@/lib/orders/resolveOrderIdentifier';
import { resolveActiveFloristOrder } from '@/lib/vera/orderWorkflow/exceptionScenarios';
import { fetchWhatsAppMediaFromMeta } from '@/lib/whatsapp/proxyWhatsAppMedia';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';

const ORDER_NUMBER_PATTERN = /\b([A-Z]{2}-[A-Z]{2}-\d{2}-\d{3})\b/i;

export type IngestFloristWhatsAppPhotoInput = {
    floristPhoneE164: string;
    mediaId: string;
    caption?: string;
};

export type IngestFloristWhatsAppPhotoResult =
    | { ok: true; orderId: string; photoAfterUrl: string; shouldNotify: boolean }
    | { ok: false; skipped: string };

function extractOrderNumberFromText(text: string): string | null {
    const match = text.match(ORDER_NUMBER_PATTERN);
    return match?.[1]?.toUpperCase() ?? null;
}

async function resolvePartnerByWhatsAppPhone(phoneE164: string) {
    const phoneDigits = phoneE164.replace(/\D/g, '');
    return prisma.partner.findFirst({
        where: {
            deletedAt: null,
            OR: [
                { whatsappNumber: phoneE164 },
                { whatsappNumber: { contains: phoneDigits.slice(-9) } },
            ],
        },
        select: { id: true, shopName: true },
    });
}

function isImageMimeType(mimeType: string): boolean {
    return mimeType.toLowerCase().startsWith('image/');
}

/**
 * Registra foto posa inviata liberamente su WhatsApp dal fiorista partner:
 * download Meta → Blob → deliveryProof COMPLETED → order.photos / GdM.
 */
export async function ingestFloristWhatsAppPhoto(
    input: IngestFloristWhatsAppPhotoInput
): Promise<IngestFloristWhatsAppPhotoResult> {
    const floristPhoneE164 = normalizePhoneE164(input.floristPhoneE164);
    if (!floristPhoneE164) {
        return { ok: false, skipped: 'invalid_florist_phone' };
    }

    const mediaId = input.mediaId.trim();
    if (!mediaId) {
        return { ok: false, skipped: 'missing_media_id' };
    }

    const partner = await resolvePartnerByWhatsAppPhone(floristPhoneE164);
    if (!partner) {
        return { ok: false, skipped: 'sender_not_florist_partner' };
    }

    const caption = (input.caption || '').trim();
    const orderNumberFromCaption = extractOrderNumberFromText(caption);

    let order =
        orderNumberFromCaption
            ? await resolveOrderByPublicRef(orderNumberFromCaption, {
                  id: true,
                  orderNumber: true,
                  partnerId: true,
                  status: true,
                  deceasedName: true,
                  deceasedProfile: { select: { fullName: true } },
                  deliveryProof: {
                      select: {
                          id: true,
                          status: true,
                          photoAfterUrl: true,
                          photosAfterUrls: true,
                          photosBeforeUrls: true,
                          photoBeforeUrl: true,
                      },
                  },
              })
            : null;

    if (order && order.partnerId !== partner.id) {
        return { ok: false, skipped: 'order_not_assigned_to_florist' };
    }

    if (!order) {
        const activeOrder = await resolveActiveFloristOrder(partner.id);
        if (!activeOrder) {
            return { ok: false, skipped: 'no_matching_active_order' };
        }
        order = await prisma.order.findFirst({
            where: { id: activeOrder.id, deletedAt: null },
            select: {
                id: true,
                orderNumber: true,
                partnerId: true,
                status: true,
                deceasedName: true,
                deceasedProfile: { select: { fullName: true } },
                deliveryProof: {
                    select: {
                        id: true,
                        status: true,
                        photoAfterUrl: true,
                        photosAfterUrls: true,
                        photosBeforeUrls: true,
                        photoBeforeUrl: true,
                    },
                },
            },
        });
    }

    if (!order?.partnerId) {
        return { ok: false, skipped: 'order_without_partner' };
    }

    const previousAfterUrl =
        order.deliveryProof?.photoAfterUrl || order.deliveryProof?.photosAfterUrls?.[0] || null;
    const wasAlreadyCompleted = order.deliveryProof?.status === 'COMPLETED';

    let mediaBuffer: ArrayBuffer;
    let mimeType: string;
    try {
        const downloaded = await fetchWhatsAppMediaFromMeta(mediaId);
        mediaBuffer = downloaded.buffer;
        mimeType = downloaded.mimeType;
    } catch (err) {
        console.error('[delivery-automation] Download media Meta fallito:', err);
        return { ok: false, skipped: 'media_download_failed' };
    }

    if (!isImageMimeType(mimeType)) {
        return { ok: false, skipped: 'unsupported_media_type' };
    }

    let photoAfterUrl: string;
    try {
        photoAfterUrl = await processProofImageBuffer(Buffer.from(mediaBuffer), order);
    } catch (err) {
        console.error('[delivery-automation] Elaborazione foto fallita:', err);
        return { ok: false, skipped: 'image_processing_failed' };
    }

    const existingBefore =
        order.deliveryProof?.photosBeforeUrls?.length
            ? order.deliveryProof.photosBeforeUrls
            : order.deliveryProof?.photoBeforeUrl
              ? [order.deliveryProof.photoBeforeUrl]
              : [];
    const existingAfter =
        order.deliveryProof?.photosAfterUrls?.length
            ? order.deliveryProof.photosAfterUrls
            : order.deliveryProof?.photoAfterUrl
              ? [order.deliveryProof.photoAfterUrl]
              : [];

    // WhatsApp: ogni scatto si aggiunge alla gallery "dopo" (niente overwrite a raffica).
    // Non inventare uno slot "prima" uguale alla nuova foto.
    const photosBeforeUrls = existingBefore;
    const photosAfterUrls = uniqueAppendPhotoUrls(existingAfter, photoAfterUrl);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        await tx.deliveryProof.upsert({
            where: { orderId: order.id },
            update: {
                partnerId: order.partnerId!,
                photosBeforeUrls,
                photosAfterUrls,
                photoBeforeUrl: photosBeforeUrls[0] ?? null,
                photoAfterUrl: photosAfterUrls.at(-1) ?? photoAfterUrl,
                timestampAfter: now,
                timestampBefore:
                    photosBeforeUrls.length > 0 && !order.deliveryProof?.photoBeforeUrl
                        ? now
                        : undefined,
                status: 'COMPLETED',
            },
            create: {
                orderId: order.id,
                partnerId: order.partnerId!,
                photosBeforeUrls,
                photosAfterUrls,
                photoBeforeUrl: photosBeforeUrls[0] ?? null,
                photoAfterUrl: photosAfterUrls.at(-1) ?? photoAfterUrl,
                timestampBefore: photosBeforeUrls.length ? now : null,
                timestampAfter: now,
                status: 'COMPLETED',
            },
        });

        await injectDeliveryPhotosOnOrder(tx, order.id, photosBeforeUrls, photosAfterUrls);
        await tx.order.update({
            where: { id: order.id },
            data: { status: 'COMPLETED' },
        });
    });

    const fullOrder = await prisma.order.findFirst({
        where: { id: order.id, deletedAt: null },
        include: {
            partner: true,
            items: { include: { product: true } },
            deliveryProof: true,
            deceasedProfile: true,
            user: { select: { id: true, email: true, name: true } },
        },
    });

    if (fullOrder) {
        const linkedUser = await ensureUserForOrder(fullOrder);
        if (linkedUser) {
            await prisma.deliveryProof.update({
                where: { orderId: order.id },
                data: { userId: linkedUser.id },
            });
        }
        // Collegamenti User↔Defunto e Partner↔Defunto (scheda fiorista + GdM).
        await syncDeceasedRelationsForOrder(order.id);
        // Gallery defunto + order.photos (scheda defunto / fiorista / GdM).
        await propagateDeliveryPhotosToLinkedProfiles(order.id, [photoAfterUrl]);
        void triggerSocialSanitizationForOrder(order.id, photosAfterUrls);

        try {
            await onOrderStatusChanged(order.id, 'COMPLETED');
        } catch (err) {
            console.error('[ingestFloristWhatsAppPhoto] Error calling onOrderStatusChanged:', err);
        }
    }

    const shouldNotify = !wasAlreadyCompleted || previousAfterUrl !== photoAfterUrl;

    console.info(
        `[delivery-automation] Foto WhatsApp registrata ordine=${order.orderNumber || order.id} partner=${partner.shopName} afterCount=${photosAfterUrls.length} notify=${shouldNotify}`
    );

    return {
        ok: true,
        orderId: order.id,
        photoAfterUrl,
        shouldNotify,
    };
}
