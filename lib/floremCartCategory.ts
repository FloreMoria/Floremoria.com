import { products, type Product } from '@/lib/products';

export type FloremCatalogCategory = NonNullable<Product['category']>;

export function getCategoryForProductId(productId: string): FloremCatalogCategory | undefined {
    return products.find((p) => p.id === productId)?.category;
}

/** Stato categorie note nel carrello (righe senza `category` in catalogo vengono ignorate). */
export function getCartCatalogCategoryState(cart: { productId: string }[]): { kind: 'empty' } | { kind: 'single'; category: FloremCatalogCategory } | { kind: 'mixed' } {
    const cats = new Set<FloremCatalogCategory>();
    for (const line of cart) {
        const c = getCategoryForProductId(line.productId);
        if (c) cats.add(c);
    }
    if (cats.size === 0) return { kind: 'empty' };
    if (cats.size > 1) return { kind: 'mixed' };
    return { kind: 'single', category: [...cats][0] };
}

/**
 * Un solo catalogo per ordine: `cimitero` (FT), `funerale` (FF), `animali` (FA/PA) non si mescolano.
 * Regola rigida: nessun abbinamento FT + FA (accessori Piccoli Amici inclusi).
 */
export function canAddProductToCart(cart: { productId: string }[], product: Pick<Product, 'id' | 'category'>): boolean {
    if (!product.category) return true;
    const st = getCartCatalogCategoryState(cart);
    if (st.kind === 'mixed') return false;
    if (st.kind === 'empty') return true;
    return st.category === product.category;
}
