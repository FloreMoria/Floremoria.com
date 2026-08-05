import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { syncOrderPhotosArray } from '@/lib/deliveryProof/proofPhotoUrls';

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
    const photos = syncOrderPhotosArray(photosBeforeUrls, photosAfterUrls);

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
 * Aggiorna la copertina della scheda Defunto con l'ultima foto di posa.
 * Il dossier utente (GdM) legge le foto dagli Order collegati via UserDeceasedLink.
 */
export async function injectDeceasedCoverFromDelivery(
    orderId: string,
    photosAfterUrls: string[]
): Promise<void> {
    const coverUrl = photosAfterUrls.map((u) => u.trim()).filter(Boolean).at(-1);
    if (!coverUrl) return;

    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { deceasedProfileId: true },
    });
    if (!order?.deceasedProfileId) return;

    await prisma.deceasedProfile.update({
        where: { id: order.deceasedProfileId },
        data: { coverUrl },
    });
}
