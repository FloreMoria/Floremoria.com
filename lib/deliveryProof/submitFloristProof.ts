import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { processProofImageFile } from '@/lib/deliveryProof/processProofImage';
import { injectDeliveryPhotosOnOrder } from '@/lib/deliveryProof/injectOrderDeliveryPhotos';
import { ensureUserForOrder } from '@/lib/auth/ensureOrderUser';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';
import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import { triggerSocialSanitizationForOrder } from '@/lib/deliveryProof/triggerSocialSanitization';

export type SubmitFloristProofInput = {
    orderId: string;
    beforeFiles: File[];
    afterFiles: File[];
    gpsLatitude?: number | null;
    gpsLongitude?: number | null;
};

export type SubmitFloristProofResult =
    | { ok: true; orderId: string; giardinoUrl: string }
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
            user: { select: { id: true, email: true, name: true } },
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

        await tx.order.update({
            where: { id: order.id },
            data: { status: 'DELIVERING' },
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

    if (photosAfterUrls.length) {
        void triggerSocialSanitizationForOrder(order.id, photosAfterUrls);
    }

    const giardinoUrl = await buildProofFotoAccessUrl(order.id, order.orderNumber);
    try {
        await onOrderStatusChanged(order.id, 'DELIVERING');
    } catch (err) {
        console.error('[submitFloristDeliveryProof] Notifica VERA post-consegna fallita:', err);
    }

    revalidatePath('/dashboard/user');
    revalidatePath('/dashboard');
    revalidatePath(`/fiorista/consegna/${order.id}`);
    if (order.orderNumber) {
        revalidatePath(`/fiorista/consegna/${order.orderNumber}`);
    }

    return { ok: true, orderId: order.id, giardinoUrl };
}
