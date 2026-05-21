import { getImagesFromFilesystem } from '@/lib/getImages';
import { getPublicSiteBaseUrl } from '@/lib/siteBaseUrl';

/** Percorsi piatti legacy (seed) tipo /images/products/cuore-corona.webp — non esistono su disco. */
export function isFlatLegacyProductImagePath(path: string): boolean {
    return /^\/images\/products\/[^/]+\.webp$/i.test(path.trim());
}

export function toAbsolutePublicAssetUrl(relativeOrAbsolute: string): string {
    const trimmed = relativeOrAbsolute.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const base = getPublicSiteBaseUrl();
    return `${base}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function isUsableStoredPath(path: string | null | undefined): path is string {
    if (!path?.trim()) return false;
    return !isFlatLegacyProductImagePath(path);
}

type ProductImageInput = {
    slug: string;
    name: string;
    mediaUrl?: string | null;
    images?: { url: string; alt?: string | null }[];
};

/** Percorsi relativi stabili: DB valido → galleria manifest per slug istituzionale. */
export function resolveRelativeProductImagePaths(product: Pick<ProductImageInput, 'slug' | 'mediaUrl' | 'images'>): string[] {
    const stored = [
        ...(product.images?.map((img) => img.url) ?? []),
        product.mediaUrl,
    ].filter(isUsableStoredPath);

    const uniqueStored = [...new Set(stored.map((p) => p.trim()))];
    if (uniqueStored.length > 0) return uniqueStored;

    return getImagesFromFilesystem(product.slug);
}

export function resolvePartnerProductImages(product: ProductImageInput): {
    cover: string | null;
    gallery: { url: string; alt: string }[];
} {
    const relativePaths = resolveRelativeProductImagePaths(product);
    const gallery = relativePaths.map((rel, idx) => ({
        url: toAbsolutePublicAssetUrl(rel),
        alt: product.images?.[idx]?.alt?.trim() || product.name,
    }));

    return {
        cover: gallery[0]?.url ?? null,
        gallery,
    };
}
