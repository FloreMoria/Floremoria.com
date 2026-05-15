import type { Category, Product, ProductImage } from '@prisma/client';
import { getPublicSiteBaseUrl } from '@/lib/siteBaseUrl';

type ProductWithCategoryImages = Product & {
    category: Category;
    images: ProductImage[];
};

export function resolveProductImageUrl(product: ProductWithCategoryImages): string | null {
    const base = getPublicSiteBaseUrl();
    const firstImg = product.images?.[0]?.url;
    const raw = firstImg || product.mediaUrl;
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;
    return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export function mapCatalogProduct(product: ProductWithCategoryImages) {
    const image = resolveProductImageUrl(product);
    return {
        id: product.id,
        name: product.name,
        price: product.basePriceCents / 100,
        priceCents: product.basePriceCents,
        currency: product.currency,
        image,
        category: {
            id: product.category.id,
            name: product.category.name,
            slug: product.category.slug,
        },
    };
}

export const partnerCatalogInclude = {
    category: true,
    images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
} as const;
