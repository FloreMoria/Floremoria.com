import { getImagesFromFilesystem } from '@/lib/getImages';

export type ProductImageSource = {
    id: string;
    slug?: string;
    mediaUrl?: string | null;
    imageUrl?: string | null;
    image?: string | null;
    images?: { url: string }[];
    /** Copertina dal manifest locale (passata dal server). */
    manifestCover?: string | null;
};

/** Percorsi candidati in ordine di priorità: DB → manifest → fallback per id/slug. */
export function getProductImageCandidates(
    product: ProductImageSource,
    opts?: { includeManifest?: boolean },
): string[] {
    const candidates: string[] = [];
    const fromDb =
        product.mediaUrl?.trim() ||
        product.imageUrl?.trim() ||
        product.image?.trim() ||
        product.images?.[0]?.url?.trim() ||
        product.manifestCover?.trim();

    if (fromDb) candidates.push(fromDb);

    candidates.push(`/images/products/${product.id}.webp`);

    if (product.slug) {
        candidates.push(`/images/products/${product.slug}.webp`);
        if (opts?.includeManifest) {
            const manifestImages = getImagesFromFilesystem(product.slug);
            if (manifestImages[0]) candidates.push(manifestImages[0]);
        }
    }

    return [...new Set(candidates.filter(Boolean))];
}

export function resolveDashboardProductImageSrc(
    product: ProductImageSource,
    opts?: { includeManifest?: boolean },
): string | null {
    const candidates = getProductImageCandidates(product, opts);
    return candidates[0] ?? null;
}
