import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { processProofImageFile } from '@/lib/deliveryProof/processProofImage';
import { injectDeliveryPhotosOnOrder } from '@/lib/deliveryProof/injectOrderDeliveryPhotos';
import { buildMagicPhotoDeliveryUrl } from '@/lib/auth/magicPhotoDelivery';
import { sendMagicPhotoDeliveryToFuturia } from '@/lib/futuria/magicPhotoDeliveryNotify';
import { ensureUserForOrder } from '@/lib/auth/ensureOrderUser';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import { formatDeliveredProductsSummary } from '@/lib/orders/formatDeliveredProducts';

export type SubmitFloristProofInput = {
    orderId: string;
    beforeFiles: File[];
    afterFiles: File[];
    gpsLatitude?: number | null;
    gpsLongitude?: number | null;
};

export type SubmitFloristProofResult =
    | { ok: true; orderId: string; magicLinkUrl: string }
    | { ok: false; error: string };

const MAX_PHOTOS_PER_SLOT = 3;

export async function submitFloristDeliveryProof(
    input: SubmitFloristProofInput
): Promise<SubmitFloristProofResult> {
    const { orderId, beforeFiles, afterFiles, gpsLatitude, gpsLongitude } = input;

    if (!beforeFiles.length || !afterFiles.length) {
        return { ok: false, error: 'Servono almeno 1 foto "Prima" e 1 foto "Dopo".' };
    }
    if (beforeFiles.length > MAX_PHOTOS_PER_SLOT || afterFiles.length > MAX_PHOTOS_PER_SLOT) {
        return { ok: false, error: `Massimo ${MAX_PHOTOS_PER_SLOT} foto per slot.` };
    }

    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            partner: true,
            items: { include: { product: true } },
            deliveryProof: true,
            deceasedProfile: true,
        },
    });

    if (!order) {
        return { ok: false, error: 'Ordine non trovato.' };
    }
    if (!order.partnerId) {
        return { ok: false, error: 'Ordine senza fiorista assegnato.' };
    }

    const photosBeforeUrls: string[] = [];
    for (let i = 0; i < beforeFiles.length; i += 1) {
        photosBeforeUrls.push(await processProofImageFile(beforeFiles[i]!, 'before', order, i));
    }
    const photosAfterUrls: string[] = [];
    for (let i = 0; i < afterFiles.length; i += 1) {
        photosAfterUrls.push(await processProofImageFile(afterFiles[i]!, 'after', order, i));
    }

    const photoBeforeUrl = photosBeforeUrls[0] ?? null;
    const photoAfterUrl = photosAfterUrls[0] ?? null;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        await tx.deliveryProof.upsert({
            where: { orderId: order.id },
            update: {
                photosBeforeUrls,
                photosAfterUrls,
                photoBeforeUrl,
                photoAfterUrl,
                timestampBefore: now,
                timestampAfter: now,
                gpsLatitude: gpsLatitude ?? undefined,
                gpsLongitude: gpsLongitude ?? undefined,
                status: 'COMPLETED',
            },
            create: {
                orderId: order.id,
                partnerId: order.partnerId!,
                photosBeforeUrls,
                photosAfterUrls,
                photoBeforeUrl,
                photoAfterUrl,
                timestampBefore: now,
                timestampAfter: now,
                gpsLatitude: gpsLatitude ?? null,
                gpsLongitude: gpsLongitude ?? null,
                status: 'COMPLETED',
            },
        });

        await injectDeliveryPhotosOnOrder(tx, order.id, photosBeforeUrls, photosAfterUrls, {
            latitude: gpsLatitude ?? order.latitude,
            longitude: gpsLongitude ?? order.longitude,
        });
    });

    const linkedUser = await ensureUserForOrder(order);
    if (linkedUser) {
        await prisma.deliveryProof.update({
            where: { orderId: order.id },
            data: { userId: linkedUser.id },
        });
    }

    await syncDeceasedRelationsForOrder(order.id);

    const magicLinkUrl = buildMagicPhotoDeliveryUrl(order.id);
    const deliveredProductsSummary = formatDeliveredProductsSummary(order.items);

    void sendMagicPhotoDeliveryToFuturia({
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerFullName: order.buyerFullName,
        buyerEmail: order.buyerEmail,
        customerPhone: order.customerPhone,
        deceasedName: order.deceasedName,
        cemeteryCity: order.cemeteryCity,
        cemeteryName: order.cemeteryName,
        deliveryProvince: order.deliveryProvince,
        deliveredProductsSummary,
        magicLinkUrl,
        photoAfterUrl,
    }).catch((err) => {
        console.error('[submitFloristDeliveryProof] Futuria magic-photo notify failed:', err);
    });

    revalidatePath('/dashboard/user');
    revalidatePath('/dashboard');
    revalidatePath(`/fiorista/consegna/${order.id}`);
    if (order.orderNumber) {
        revalidatePath(`/fiorista/consegna/${order.orderNumber}`);
    }

    return { ok: true, orderId: order.id, magicLinkUrl };
}
