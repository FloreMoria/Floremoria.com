/** True per Messaggio, Nastro commemorativo e varianti catalogo (FT/FF/FA). */
export function productRequiresCustomMessage(slug: string | null | undefined): boolean {
    if (!slug?.trim()) return false;
    const s = slug.toLowerCase();
    return s.includes('messaggio') || s.includes('nastro') || s.includes('biglietto');
}

export function orderCategoryToCatalogSlug(orderCategory: string): string | null {
    switch (orderCategory.toUpperCase()) {
        case 'FT':
            return 'cimitero';
        case 'FF':
            return 'funerale';
        case 'FA':
            return 'animali';
        default:
            return null;
    }
}
