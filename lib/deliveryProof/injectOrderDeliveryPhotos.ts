import type { Prisma } from '@prisma/client';
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
            status: 'DELIVERING',
            photos,
            ...(extra?.latitude != null ? { latitude: extra.latitude } : {}),
            ...(extra?.longitude != null ? { longitude: extra.longitude } : {}),
        },
    });

    return photos;
}
