import type { Category, Product, ProductImage } from '@prisma/client';
import { resolvePartnerProductCopy } from '@/lib/partnerProductCopy';
import { resolvePartnerProductImages } from '@/lib/resolveProductPublicImage';

type ProductWithCategoryImages = Product & {
    category: Category;
    images: ProductImage[];
};

export function resolveProductImageUrl(product: ProductWithCategoryImages): string | null {
    return resolvePartnerProductImages(product).cover;
}

export function mapCatalogProduct(product: ProductWithCategoryImages) {
    const { cover, gallery } = resolvePartnerProductImages(product);
    const { shortDescription, description } = resolvePartnerProductCopy(product);

    return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: product.basePriceCents / 100,
        priceCents: product.basePriceCents,
        currency: product.currency,
        image: cover,
        shortDescription,
        description,
        images: gallery,
        category: {
            id: product.category.id,
            name: product.category.name,
            slug: product.category.slug,
        },
    };
}

export function mapCatalogProductDetail(product: ProductWithCategoryImages) {
    return mapCatalogProduct(product);
}

export const partnerCatalogInclude = {
    category: true,
    images: { orderBy: { sortOrder: 'asc' as const } },
} as const;
