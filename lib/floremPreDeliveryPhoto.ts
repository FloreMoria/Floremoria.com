import { products } from '@/lib/products';

/** Preferenza utente: foto del luogo prima della posa (1,49 €). */
export const FLOREM_PRE_DELIVERY_PHOTO_PREF_KEY = 'florem_opt_foto_stato_prima_consegna';

export const FLOREM_PRE_DELIVERY_PHOTO_PRODUCT_ID = 'florem-foto-stato-prima';
export const FLOREM_PRE_DELIVERY_PHOTO_SLUG = 'foto-stato-prima-consegna';
export const FLOREM_PRE_DELIVERY_PHOTO_NAME = 'Foto stato di fatto prima della consegna';
export const FLOREM_PRE_DELIVERY_PHOTO_PRICE_CENTS = 149;

export type CartLineWithProductId = {
    productId: string;
    name?: string;
    priceCents?: number;
    qty?: number;
    slug?: string;
};

export function readPreDeliveryPhotoPref(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(FLOREM_PRE_DELIVERY_PHOTO_PREF_KEY) === '1';
    } catch {
        return false;
    }
}

export function setPreDeliveryPhotoPref(active: boolean): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(FLOREM_PRE_DELIVERY_PHOTO_PREF_KEY, active ? '1' : '0');
    } catch {
        /* ignore */
    }
}

export function clearPreDeliveryPhotoPref(): void {
    setPreDeliveryPhotoPref(false);
}

/** Rimuove la riga supplemento foto dal carrello in `localStorage` (es. deselezione dalla home). */
export function removePreDeliveryPhotoLineFromStoredCart(): void {
    if (typeof window === 'undefined') return;
    try {
        const cartStr = localStorage.getItem('fm_cart');
        if (!cartStr) return;
        const cart = JSON.parse(cartStr) as CartLineWithProductId[];
        const next = cart.filter((i) => i.productId !== FLOREM_PRE_DELIVERY_PHOTO_PRODUCT_ID);
        if (next.length !== cart.length) {
            localStorage.setItem('fm_cart', JSON.stringify(next));
        }
    } catch {
        /* ignore */
    }
}

/** Supplemento «foto prima» valido solo per omaggi tombe (FT), non per funerale / Piccoli Amici. */
function cartHasCimiteroBouquet(cart: CartLineWithProductId[]): boolean {
    return cart.some((i) => {
        const p = products.find((pr) => pr.id === i.productId);
        return p?.isBouquet === true && p?.category === 'cimitero';
    });
}

/**
 * Se la preferenza è attiva, aggiunge al carrello la riga servizio (idempotente).
 * Non aggiunge nulla se il carrello è vuoto o non contiene almeno un omaggio principale tombe (FT).
 */
export function mergePreDeliveryPhotoIntoCart<T extends CartLineWithProductId>(cart: T[]): T[] {
    if (!readPreDeliveryPhotoPref()) return cart;
    if (cart.length === 0) return cart;
    if (!cartHasCimiteroBouquet(cart)) return cart;
    if (cart.some((i) => i.productId === FLOREM_PRE_DELIVERY_PHOTO_PRODUCT_ID)) return cart;
    const line = {
        productId: FLOREM_PRE_DELIVERY_PHOTO_PRODUCT_ID,
        slug: FLOREM_PRE_DELIVERY_PHOTO_SLUG,
        name: FLOREM_PRE_DELIVERY_PHOTO_NAME,
        priceCents: FLOREM_PRE_DELIVERY_PHOTO_PRICE_CENTS,
        qty: 1,
    } as T;
    return [...cart, line];
}
