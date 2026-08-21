import type { DeliveryProof } from '@prisma/client';

export type ProofPhotoSlot = 'before' | 'after';

export type OrderProofPhotos = {
    before: string[];
    after: string[];
    hasPhotos: boolean;
};

/** Unifica deliveryProof (mini-app fiorista) e fallback su order.photos — senza LIMIT 1. */
export function getOrderProofPhotos(order: {
    photos?: string[];
    deliveryProof?: Pick<
        DeliveryProof,
        'photoBeforeUrl' | 'photoAfterUrl' | 'photosBeforeUrls' | 'photosAfterUrls'
    > | null;
}): OrderProofPhotos {
    const proof = order.deliveryProof;

    const beforeSet = new Set<string>();
    const afterSet = new Set<string>();

    const pushUnique = (set: Set<string>, urls: Array<string | null | undefined>) => {
        for (const u of urls) {
            const t = typeof u === 'string' ? u.trim() : '';
            if (t) set.add(t);
        }
    };

    if (proof) {
        pushUnique(beforeSet, proof.photosBeforeUrls || []);
        pushUnique(beforeSet, [proof.photoBeforeUrl]);
        pushUnique(afterSet, proof.photosAfterUrls || []);
        pushUnique(afterSet, [proof.photoAfterUrl]);
    }

    // URL in Order.photos non già classificate → slot "dopo" (storico flat).
    for (const u of order.photos || []) {
        const t = typeof u === 'string' ? u.trim() : '';
        if (!t) continue;
        if (beforeSet.has(t) || afterSet.has(t)) continue;
        afterSet.add(t);
    }

    const before = [...beforeSet];
    const after = [...afterSet];
    return {
        before,
        after,
        hasPhotos: before.length > 0 || after.length > 0,
    };
}

/** Array flat per sezioni che non distinguono prima/dopo (es. scheda utenti admin). */
export function getFlatProofPhotoUrls(order: Parameters<typeof getOrderProofPhotos>[0]): string[] {
    const { before, after } = getOrderProofPhotos(order);
    return [...before, ...after];
}

export function syncOrderPhotosArray(before: string[], after: string[]): string[] {
    return [...before, ...after];
}
