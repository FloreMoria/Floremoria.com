import type { Category, Product, ProductImage } from '@prisma/client';
import { resolvePartnerProductImages } from '@/lib/resolveProductPublicImage';

type ProductWithCategoryImages = Product & {
    category: Category;
    images: ProductImage[];
};

export function resolveProductImageUrl(product: ProductWithCategoryImages): string | null {
    return resolvePartnerProductImages(product).cover;
}

export function mapCatalogProduct(product: ProductWithCategoryImages) {
    const { cover } = resolvePartnerProductImages(product);

    return {
        id: product.id,
        name: product.name,
        price: product.basePriceCents / 100,
        priceCents: product.basePriceCents,
        currency: product.currency,
        image: cover,
        category: {
            id: product.category.id,
            name: product.category.name,
            slug: product.category.slug,
        },
    };
}

export function mapCatalogProductDetail(product: ProductWithCategoryImages) {
    const { gallery } = resolvePartnerProductImages(product);

    return {
        ...mapCatalogProduct(product),
        slug: product.slug,
        shortDescription: product.shortDescription,
        description: product.description,
        images: gallery,
    };
}

export const partnerCatalogInclude = {
    category: true,
    images: { orderBy: { sortOrder: 'asc' as const } },
} as const;
