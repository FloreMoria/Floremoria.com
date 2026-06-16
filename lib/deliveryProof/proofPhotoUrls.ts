import type { DeliveryProof } from '@prisma/client';

export type ProofPhotoSlot = 'before' | 'after';

export type OrderProofPhotos = {
    before: string[];
    after: string[];
    hasPhotos: boolean;
};

/** Unifica deliveryProof (mini-app fiorista) e fallback su order.photos. */
export function getOrderProofPhotos(order: {
    photos?: string[];
    deliveryProof?: Pick<
        DeliveryProof,
        'photoBeforeUrl' | 'photoAfterUrl' | 'photosBeforeUrls' | 'photosAfterUrls'
    > | null;
}): OrderProofPhotos {
    const proof = order.deliveryProof;
    if (proof) {
        const before =
            proof.photosBeforeUrls.length > 0
                ? proof.photosBeforeUrls
                : proof.photoBeforeUrl
                  ? [proof.photoBeforeUrl]
                  : [];
        const after =
            proof.photosAfterUrls.length > 0
                ? proof.photosAfterUrls
                : proof.photoAfterUrl
                  ? [proof.photoAfterUrl]
                  : [];
        if (before.length > 0 || after.length > 0) {
            return { before, after, hasPhotos: true };
        }
    }

    const legacy = order.photos ?? [];
    if (legacy.length > 0) {
        return { before: [], after: legacy, hasPhotos: true };
    }

    return { before: [], after: [], hasPhotos: false };
}

/** Array flat per sezioni che non distinguono prima/dopo (es. scheda utenti admin). */
export function getFlatProofPhotoUrls(order: Parameters<typeof getOrderProofPhotos>[0]): string[] {
    const { before, after } = getOrderProofPhotos(order);
    return [...before, ...after];
}

export function syncOrderPhotosArray(before: string[], after: string[]): string[] {
    return [...before, ...after];
}
