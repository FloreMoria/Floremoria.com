import { Product } from './products';

export type ProductCategoryPath =
    | 'fiori-sulle-tombe'
    | 'fiori-per-funerale'
    | 'fiori-per-animali-domestici'
    | 'accessori';

/**
 * Ritorna il prefisso di rotta nativo in base alla categoria e al tipo di prodotto:
 * - Accessori (isBouquet === false): 'accessori'
 * - Funerale (category === 'funerale'): 'fiori-per-funerale'
 * - Piccoli Amici (category === 'animali'): 'fiori-per-animali-domestici'
 * - Cimitero (category === 'cimitero' o default): 'fiori-sulle-tombe'
 */
export function getProductCategoryPath(product: {
    slug: string;
    category?: string;
    isBouquet?: boolean;
}): ProductCategoryPath {
    if (product.isBouquet === false) {
        return 'accessori';
    }
    if (product.category === 'funerale') {
        return 'fiori-per-funerale';
    }
    if (product.category === 'animali') {
        return 'fiori-per-animali-domestici';
    }
    return 'fiori-sulle-tombe';
}

/**
 * Ritorna l'URL nativo completo per la pagina di dettaglio del prodotto (PDP).
 * Es: /fiori-sulle-tombe/bouquet-di-rose
 * Es: /fiori-per-funerale/bouquet-cordoglio-sincero
 * Es: /fiori-per-animali-domestici/un-raggio-di-sole
 * Es: /accessori/lumino
 */
export function getProductUrl(product: {
    slug: string;
    category?: string;
    isBouquet?: boolean;
}): string {
    const categoryPath = getProductCategoryPath(product);
    return `/${categoryPath}/${product.slug}`;
}
