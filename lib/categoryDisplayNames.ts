/** Nomi canonici delle tre categorie catalogo (SOFIA: coerenza terminologica). */
const CANONICAL_BY_SLUG: Record<string, string> = {
    cimitero: 'Fiori sulle Tombe',
    funerale: 'Fiori per Funerali',
    animali: 'Piccoli Amici',
};

export function getCategoryDisplayName(category?: { name: string; slug?: string } | null): string {
    if (!category) return 'Senza Categoria';

    if (category.slug && CANONICAL_BY_SLUG[category.slug]) {
        return CANONICAL_BY_SLUG[category.slug];
    }

    const lower = category.name.toLowerCase();
    if (lower.includes('fiori sulle tombe') || lower.includes('cimitero') || lower.includes('tombe')) {
        return 'Fiori sulle Tombe';
    }
    if (lower.includes('fiori per funerali') || lower.includes('funerale')) {
        return 'Fiori per Funerali';
    }
    if (lower.includes('piccoli amici') || lower.includes('animali')) {
        return 'Piccoli Amici';
    }

    return category.name;
}

/** Rank per ordinamento rigido del catalogo dashboard. */
export function getCategorySortRank(category?: { name: string; slug?: string } | null): number {
    const display = getCategoryDisplayName(category).toLowerCase();
    if (display.includes('fiori sulle tombe')) return 1;
    if (display.includes('fiori per funerali')) return 2;
    if (display.includes('piccoli amici')) return 3;
    return 4;
}
