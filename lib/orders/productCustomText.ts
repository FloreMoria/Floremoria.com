/** True per Messaggio, Nastro commemorativo e varianti catalogo (FT/FF/FA). */
export function productRequiresCustomMessage(slug: string | null | undefined): boolean {
    if (!slug?.trim()) return false;
    const s = slug.toLowerCase();
    return s.includes('messaggio') || s.includes('nastro') || s.includes('biglietto');
}

/** Bigliettino / messaggio d'affetto (non nastro). */
export function isCardMessageAccessory(
    slug?: string | null,
    name?: string | null
): boolean {
    const label = `${slug || ''} ${name || ''}`.toLowerCase();
    if (/nastro/.test(label)) return false;
    return /messaggio|bigliett/.test(label);
}

/** Nastro commemorativo (testo impresso). */
export function isRibbonAccessory(slug?: string | null, name?: string | null): boolean {
    return /nastro/.test(`${slug || ''} ${name || ''}`.toLowerCase());
}

/**
 * Unifica i testi distinti bigliettino/nastro nel campo DB `ticketMessage`.
 * Perché: lo schema ha un solo campo; WhatsApp {{9}} e mini-app leggono quello.
 */
export function composeTicketMessageParts(
    cardText?: string | null,
    ribbonText?: string | null
): string | null {
    const card = (cardText || '').trim();
    const ribbon = (ribbonText || '').trim();
    if (card && ribbon) return `Bigliettino: ${card}\nNastro: ${ribbon}`;
    if (card) return card;
    if (ribbon) return ribbon;
    return null;
}

/** Scompone `ticketMessage` (anche legacy a testo unico) in campi UI distinti. */
export function parseTicketMessageParts(raw?: string | null): {
    cardText: string;
    ribbonText: string;
} {
    const t = (raw || '').trim();
    if (!t) return { cardText: '', ribbonText: '' };

    const cardMatch = t.match(/Bigliettino:\s*([\s\S]*?)(?=\n\s*Nastro:|$)/i);
    const ribbonMatch = t.match(/Nastro:\s*([\s\S]*)$/i);
    if (cardMatch || ribbonMatch) {
        return {
            cardText: (cardMatch?.[1] || '').trim(),
            ribbonText: (ribbonMatch?.[1] || '').trim(),
        };
    }

    return { cardText: t, ribbonText: '' };
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
