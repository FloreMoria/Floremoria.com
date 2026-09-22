/**
 * Prodotti a destinazione mista (piante in vaso): stessi SKU in catalogo FT e FF.
 * La destinazione operativa (ordine FT vs FF) dipende dal contesto di navigazione
 * e dalla scelta esplicita del cliente — senza duplicare il prodotto a catalogo.
 */
import type { Product } from '@/lib/products';

/** Prefisso ordine commerciale da destinazione omaggio. */
export type FloremOrderDestination = 'FT' | 'FF';

/** Slug prodotti idonei sia a tomba (FT) sia a cerimonia (FF). */
export const DUAL_DESTINATION_SLUGS = new Set(['kalonche', 'margherite-gerbere']);

export function isDualDestinationProduct(
    product: Pick<Product, 'slug' | 'id'> | null | undefined
): boolean {
    if (!product) return false;
    return DUAL_DESTINATION_SLUGS.has(product.slug);
}

export function isDualDestinationSlug(slug: string | null | undefined): boolean {
    return Boolean(slug && DUAL_DESTINATION_SLUGS.has(slug));
}

/** Categoria catalogo effettiva per mix carrello / addons. */
export function catalogCategoryForDestination(
    destination: FloremOrderDestination
): 'cimitero' | 'funerale' {
    return destination === 'FF' ? 'funerale' : 'cimitero';
}

export function destinationFromCatalogPath(
    pathOrHint: string | null | undefined
): FloremOrderDestination | null {
    const p = (pathOrHint || '').toLowerCase();
    if (
        p.includes('fiori-sulle-tombe') ||
        p.includes('cimitero') ||
        p === 'ft' ||
        p === 'tomba'
    ) {
        return 'FT';
    }
    if (
        p.includes('fiori-per-funerale') ||
        p.includes('per-il-funerale') ||
        p.includes('funerale') ||
        p === 'ff'
    ) {
        return 'FF';
    }
    return null;
}

/**
 * Legge destinazione salvata sulla riga carrello (customData o campo top-level).
 */
export function readCartLineDestination(line: {
    orderCategory?: string | null;
    customData?: Record<string, unknown> | null;
}): FloremOrderDestination | null {
    const cd = line.customData || {};
    const raw =
        (line.orderCategory || '').trim().toUpperCase() ||
        String(cd.orderCategory || '').trim().toUpperCase() ||
        String(cd.destination || '').trim().toUpperCase();
    if (raw === 'FT' || raw === 'FF') return raw;
    return null;
}

/**
 * Inferisce FT/FF/FA dal carrello privilegiando la destinazione esplicita
 * sulle piante duali; altrimenti la category nativa del prodotto.
 */
export function inferOrderCategoryFromCart(
    cart: Array<{
        productId: string;
        orderCategory?: string | null;
        customData?: Record<string, unknown> | null;
    }>,
    resolveProduct: (productId: string) => Pick<Product, 'id' | 'slug' | 'category'> | undefined
): 'FT' | 'FF' | 'FA' | 'FP' {
    for (const line of cart) {
        const dest = readCartLineDestination(line);
        if (dest) return dest;
    }
    for (const line of cart) {
        const p = resolveProduct(line.productId);
        if (!p) continue;
        if (isDualDestinationProduct(p)) continue; // senza destinazione: non forzare FF
        if (p.category === 'funerale') return 'FF';
        if (p.category === 'animali') return 'FA';
        if (p.category === 'cimitero') return 'FT';
    }
    // Solo piante duali senza dest → default FT (più comune da catalogo tombe)
    if (cart.some((line) => isDualDestinationProduct(resolveProduct(line.productId)))) {
        return 'FT';
    }
    return 'FT';
}
