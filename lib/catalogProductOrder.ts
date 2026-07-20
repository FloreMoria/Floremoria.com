import { products, type Product } from '@/lib/products';

/** Ordine catalogo «Fiori sulle tombe» (omaggi + accessori cimitero). */
export const CATALOG_SLUGS_CIMITERO = [
    'bouquet-ricordo-affettuoso',
    'bouquet-di-rose',
    'kalonche',
    'bouquet-omaggio-speciale',
    'margherite-gerbere',
    'bouquet-tributo-eterno',
    'lumino',
    'messaggio',
] as const;

/** Ordine catalogo «Per il funerale». */
export const CATALOG_SLUGS_FUNERALE = [
    'cuore-corona',
    'copribara',
    'piramide',
    'cuscino',
    'bouquet-memoria-imperituri',
    'bouquet-omaggio-solenne',
    'set-ceri',
    'nastro-commemorativo',
    'bouquet-cordoglio-sincero',
    'bouquet-rispetto-vicinanza',
    'margherite-gerbere',
    'kalonche',
] as const;

export const CATALOG_SLUGS_ANIMALI_MAIN = [
    'un-raggio-di-sole',
    'abbraccio-verde',
    'legame-eterno',
    'battito-di-foglia',
    'anima-pura',
    'il-giardino-del-ponte',
] as const;

export const CATALOG_SLUGS_ANIMALI_ACCESSORIES = [
    'biglietto-piccoli-amici',
    'lumino-piccoli-amici',
    'ceri-piccoli-amici',
    'nastro-commemorativo-piccoli-amici',
] as const;

export function productsBySlugOrder(slugs: readonly string[]): Product[] {
    return slugs
        .map((slug) => products.find((p) => p.slug === slug))
        .filter((p): p is Product => p !== undefined);
}
