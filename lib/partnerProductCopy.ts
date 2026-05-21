import { getProductBySlug } from '@/lib/products';

type ProductCopySource = {
    slug: string;
    name: string;
    shortDescription?: string | null;
    description?: string | null;
};

/** Testi partner: DB Neon → catalogo istituzionale lib/products (description / descriptionSEO). */
export function resolvePartnerProductCopy(product: ProductCopySource): {
    shortDescription: string;
    description: string;
} {
    const catalog = getProductBySlug(product.slug);

    const shortDescription =
        product.shortDescription?.trim() ||
        catalog?.shortDescription?.trim() ||
        catalog?.description?.trim() ||
        product.name;

    const description =
        product.description?.trim() ||
        catalog?.descriptionSEO?.trim() ||
        catalog?.description?.trim() ||
        shortDescription;

    return { shortDescription, description };
}
