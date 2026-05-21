import { getImagesFromFilesystem } from '@/lib/getImages';
import { getProductBySlug } from '@/lib/products';
import { getPublicSiteBaseUrl } from '@/lib/siteBaseUrl';
import { buildProductAlt } from '@/utils/altText';

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

function isGenericDbAlt(alt?: string | null): boolean {
    if (!alt?.trim()) return true;
    return /^Immagine per /i.test(alt.trim());
}

function buildPartnerGalleryAlt(slug: string, name: string, relativePath: string, imageIndex: number): string {
    const catalog = getProductBySlug(slug);
    if (catalog) {
        return buildProductAlt(catalog, { context: 'gallery', imageIndex });
    }

    const fileStem = decodeURIComponent(relativePath.split('/').pop() || name)
        .replace(/\.webp$/i, '')
        .replace(/-/g, ' ');
    return `${name}, omaggio floreale FloreMoria — ${fileStem}`;
}

/** Galleria completa: manifest istituzionale + eventuali path validi extra dal DB. */
export function resolveRelativeProductImagePaths(product: Pick<ProductImageInput, 'slug' | 'mediaUrl' | 'images'>): string[] {
    const manifestPaths = getImagesFromFilesystem(product.slug);
    const storedValid = [
        ...(product.images?.map((img) => img.url) ?? []),
        product.mediaUrl,
    ]
        .filter(isUsableStoredPath)
        .map((p) => p.trim());

    if (manifestPaths.length > 0) {
        const merged = [...manifestPaths];
        for (const path of storedValid) {
            if (!merged.includes(path)) merged.push(path);
        }
        return merged;
    }

    return [...new Set(storedValid)];
}

export function resolvePartnerProductImages(product: ProductImageInput): {
    cover: string | null;
    gallery: { url: string; alt: string }[];
} {
    const relativePaths = resolveRelativeProductImagePaths(product);
    const dbAltByPath = new Map(
        (product.images ?? [])
            .filter((img) => isUsableStoredPath(img.url) && !isGenericDbAlt(img.alt))
            .map((img) => [img.url.trim(), img.alt!.trim()] as const),
    );

    const gallery = relativePaths.map((rel, idx) => ({
        url: toAbsolutePublicAssetUrl(rel),
        alt: dbAltByPath.get(rel) ?? buildPartnerGalleryAlt(product.slug, product.name, rel, idx),
    }));

    return {
        cover: gallery[0]?.url ?? null,
        gallery,
    };
}
