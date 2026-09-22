import { products, type Product } from '@/lib/products';
import {
    catalogCategoryForDestination,
    isDualDestinationProduct,
    readCartLineDestination,
} from '@/lib/floremDualDestination';

export type FloremCatalogCategory = NonNullable<Product['category']>;

export type CartLineForCategory = {
    productId: string;
    orderCategory?: string | null;
    customData?: Record<string, unknown> | null;
};

export function getCategoryForProductId(productId: string): FloremCatalogCategory | undefined {
    return products.find((p) => p.id === productId)?.category;
}

/** Categoria effettiva della riga (piante duali → destinazione FT/FF scelta). */
export function getEffectiveCatalogCategory(line: CartLineForCategory): FloremCatalogCategory | undefined {
    const product = products.find((p) => p.id === line.productId);
    if (!product) return undefined;
    if (isDualDestinationProduct(product)) {
        const dest = readCartLineDestination(line);
        if (dest) return catalogCategoryForDestination(dest);
        // Senza destinazione esplicita: non forzare funerale (evita checkout FF da catalogo tombe)
        return 'cimitero';
    }
    return product.category;
}

/** Stato categorie note nel carrello (righe senza `category` in catalogo vengono ignorate). */
export function getCartCatalogCategoryState(
    cart: CartLineForCategory[]
): { kind: 'empty' } | { kind: 'single'; category: FloremCatalogCategory } | { kind: 'mixed' } {
    const cats = new Set<FloremCatalogCategory>();
    for (const line of cart) {
        const c = getEffectiveCatalogCategory(line);
        if (c) cats.add(c);
    }
    if (cats.size === 0) return { kind: 'empty' };
    if (cats.size > 1) return { kind: 'mixed' };
    return { kind: 'single', category: [...cats][0] };
}

/**
 * Un solo catalogo per ordine: `cimitero` (FT), `funerale` (FF), `animali` (FA/PA) non si mescolano.
 * Piante duali: usano la destinazione scelta (default FT/cimitero se assente).
 */
export function canAddProductToCart(
    cart: CartLineForCategory[],
    product: Pick<Product, 'id' | 'slug' | 'category'>,
    opts?: { destination?: 'FT' | 'FF' }
): boolean {
    let incoming: FloremCatalogCategory | undefined = product.category;
    if (isDualDestinationProduct(product)) {
        incoming = catalogCategoryForDestination(opts?.destination || 'FT');
    }
    if (!incoming) return true;
    const st = getCartCatalogCategoryState(cart);
    if (st.kind === 'mixed') return false;
    if (st.kind === 'empty') return true;
    return st.category === incoming;
}
