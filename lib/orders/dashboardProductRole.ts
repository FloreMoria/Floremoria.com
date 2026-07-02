import { products as catalogProducts } from '@/lib/products';
import { orderCategoryToCatalogSlug } from '@/lib/orders/productCustomText';

export type DashboardProductLike = {
    slug?: string | null;
    name?: string | null;
    isBouquet?: boolean | null;
    category?: { slug: string } | null;
};

const catalogBySlug = new Map(catalogProducts.map((p) => [p.slug, p]));

const ACCESSORY_SLUG_PATTERN =
    /lumino|messaggio|nastro|biglietto|set-ceri|ceri-piccoli|foto-stato-prima/i;

/** Accessorio se isBouquet=false in DB o nel catalogo statico (fallback produzione). */
export function isDashboardAccessoryProduct(product: DashboardProductLike): boolean {
    if (product.isBouquet === false) return true;

    const slug = product.slug?.trim();
    if (slug) {
        const fromCatalog = catalogBySlug.get(slug);
        if (fromCatalog?.isBouquet === false) return true;
    }

    const label = `${slug || ''} ${product.name || ''}`.toLowerCase();
    return ACCESSORY_SLUG_PATTERN.test(label);
}

export function isDashboardMainProduct(product: DashboardProductLike): boolean {
    return !isDashboardAccessoryProduct(product);
}

export function filterDashboardMainProducts<T extends DashboardProductLike>(products: T[]): T[] {
    return products.filter(isDashboardMainProduct);
}

export function filterDashboardAccessories<T extends DashboardProductLike>(
    products: T[],
    orderCategory: string
): T[] {
    const catalogSlug = orderCategoryToCatalogSlug(orderCategory);

    return products.filter((product) => {
        if (!isDashboardAccessoryProduct(product)) return false;
        if (!catalogSlug) return true;

        if (product.category?.slug === catalogSlug) return true;

        const slug = product.slug?.trim();
        const fromCatalog = slug ? catalogBySlug.get(slug) : undefined;
        return fromCatalog?.category === catalogSlug;
    });
}
