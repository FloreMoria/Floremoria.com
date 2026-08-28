import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { syncOrderPhotosArray } from '@/lib/deliveryProof/proofPhotoUrls';
import { uniqueAppendPhotoUrls } from '@/lib/deliveryProof/uniqueAppendPhotoUrls';
import { isFiscalOnlyMediaUrl } from '@/lib/financial/fiscalMediaGuard';

/**
 * Inietta esplicitamente le URL foto sul record Order (oltre a DeliveryProof / Giardino / defunto).
 * Usato al passaggio a stato COMPLETED post-validazione fiorista.
 */
export async function injectDeliveryPhotosOnOrder(
    tx: Pick<Prisma.TransactionClient, 'order'>,
    orderId: string,
    photosBeforeUrls: string[],
    photosAfterUrls: string[],
    extra?: { latitude?: number | null; longitude?: number | null }
): Promise<string[]> {
    const photos = syncOrderPhotosArray(photosBeforeUrls, photosAfterUrls).filter(
        (u) => !isFiscalOnlyMediaUrl(u)
    );

    await tx.order.update({
        where: { id: orderId },
        data: {
            // Mini-app / prova posa = consegna completata (UI Admin + workflow VERA).
            status: 'COMPLETED',
            photos,
            ...(extra?.latitude != null ? { latitude: extra.latitude } : {}),
            ...(extra?.longitude != null ? { longitude: extra.longitude } : {}),
        },
    });

    return photos;
}

/**
 * Propaga le foto di consegna su:
 * - scheda Defunto (cover + gallery deliveryPhotoUrls)
 * - collegamenti User/Partner (sync relazioni → scheda fiorista + GdM via ordini)
 *
 * Il dossier utente (GdM) e la scheda fiorista leggono le prove dagli Order / DeliveryProof.
 */
export async function injectDeceasedCoverFromDelivery(
    orderId: string,
    photosAfterUrls: string[]
): Promise<void> {
    await propagateDeliveryPhotosToLinkedProfiles(orderId, photosAfterUrls);
}

export async function propagateDeliveryPhotosToLinkedProfiles(
    orderId: string,
    newPhotoUrls: string[]
): Promise<{
    deceasedProfileId: string | null;
    deliveryPhotoCount: number;
    orderPhotoCount: number;
}> {
    const incoming = (newPhotoUrls || [])
        .map((u) => u.trim())
        .filter(Boolean)
        .filter((u) => !isFiscalOnlyMediaUrl(u));
    if (!incoming.length) {
        return { deceasedProfileId: null, deliveryPhotoCount: 0, orderPhotoCount: 0 };
    }

    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            photos: true,
            deceasedProfileId: true,
            partnerId: true,
            userId: true,
            latitude: true,
            longitude: true,
            deliveryProof: {
                select: {
                    photosBeforeUrls: true,
                    photosAfterUrls: true,
                    photoBeforeUrl: true,
                    photoAfterUrl: true,
                    gpsLatitude: true,
                    gpsLongitude: true,
                },
            },
            deceasedProfile: {
                select: { id: true, deliveryPhotoUrls: true, coverUrl: true },
            },
        },
    });
    if (!order) {
        return { deceasedProfileId: null, deliveryPhotoCount: 0, orderPhotoCount: 0 };
    }

    // Order.photos: unione completa (prima + dopo + nuove).
    const proofBefore =
        order.deliveryProof?.photosBeforeUrls?.length
            ? order.deliveryProof.photosBeforeUrls
            : order.deliveryProof?.photoBeforeUrl
              ? [order.deliveryProof.photoBeforeUrl]
              : [];
    const proofAfter =
        order.deliveryProof?.photosAfterUrls?.length
            ? order.deliveryProof.photosAfterUrls
            : order.deliveryProof?.photoAfterUrl
              ? [order.deliveryProof.photoAfterUrl]
              : [];
    const mergedOrderPhotos = uniqueAppendPhotoUrls(
        [...proofBefore, ...proofAfter, ...(order.photos || [])],
        incoming
    );

    await prisma.order.update({
        where: { id: order.id },
        data: { photos: mergedOrderPhotos },
    });

    let deceasedProfileId = order.deceasedProfileId;
    let deliveryPhotoCount = 0;

    const gpsLatitude = order.latitude ?? order.deliveryProof?.gpsLatitude ?? null;
    const gpsLongitude = order.longitude ?? order.deliveryProof?.gpsLongitude ?? null;

    if (deceasedProfileId) {
        const existingGallery = order.deceasedProfile?.deliveryPhotoUrls || [];
        const mergedGallery = uniqueAppendPhotoUrls(existingGallery, incoming);
        const coverUrl = mergedGallery.at(-1) || order.deceasedProfile?.coverUrl || null;

        await prisma.deceasedProfile.update({
            where: { id: deceasedProfileId },
            data: {
                deliveryPhotoUrls: mergedGallery,
                ...(coverUrl ? { coverUrl } : {}),
                ...(gpsLatitude != null ? { latitude: gpsLatitude } : {}),
                ...(gpsLongitude != null ? { longitude: gpsLongitude } : {}),
            },
        });
        deliveryPhotoCount = mergedGallery.length;
    }

    console.info(
        `[delivery-photos] Propagate order=${order.id} deceased=${deceasedProfileId || 'none'} ` +
            `orderPhotos=${mergedOrderPhotos.length} deceasedGallery=${deliveryPhotoCount} ` +
            `partner=${order.partnerId || 'none'} user=${order.userId || 'none'}`
    );

    return {
        deceasedProfileId,
        deliveryPhotoCount,
        orderPhotoCount: mergedOrderPhotos.length,
    };
}
