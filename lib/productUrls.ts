import { Product } from './products';
import { isDualDestinationSlug } from '@/lib/floremDualDestination';

export type ProductCategoryPath =
    | 'fiori-sulle-tombe'
    | 'fiori-per-funerale'
    | 'fiori-per-animali-domestici'
    | 'accessori';

/** Contesto catalogo da cui si apre la PDP (piante duali FT/FF). */
export type ProductCatalogContext = 'cimitero' | 'funerale' | 'animali';

/**
 * Ritorna il prefisso di rotta nativo in base alla categoria e al tipo di prodotto:
 * - Accessori (isBouquet === false): 'accessori'
 * - Funerale (category === 'funerale'): 'fiori-per-funerale'
 * - Piccoli Amici (category === 'animali'): 'fiori-per-animali-domestici'
 * - Cimitero (category === 'cimitero' o default): 'fiori-sulle-tombe'
 * - Piante duali: rispettano `catalogContext` se passato (stesso SKU su FT e FF)
 */
export function getProductCategoryPath(
    product: {
        slug: string;
        category?: string;
        isBouquet?: boolean;
    },
    catalogContext?: ProductCatalogContext | null
): ProductCategoryPath {
    if (product.isBouquet === false) {
        return 'accessori';
    }
    if (isDualDestinationSlug(product.slug) && catalogContext) {
        if (catalogContext === 'funerale') return 'fiori-per-funerale';
        if (catalogContext === 'cimitero') return 'fiori-sulle-tombe';
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
export function getProductUrl(
    product: {
        slug: string;
        category?: string;
        isBouquet?: boolean;
    },
    catalogContext?: ProductCatalogContext | null
): string {
    const categoryPath = getProductCategoryPath(product, catalogContext);
    return `/${categoryPath}/${product.slug}`;
}
