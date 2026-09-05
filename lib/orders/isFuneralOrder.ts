/**
 * Riconoscimento ordini funerale (prefisso FF / FA) — niente auto-dispatch fiorista.
 */

export function isFuneralOrderNumber(orderNumber: string | null | undefined): boolean {
    const code = String(orderNumber || '').trim().toUpperCase();
    if (!code) return false;
    // FF = Fiori funerale; FA = a volte usato per funerale/agenzia in legacy
    return /^FF[-_]/.test(code) || code.startsWith('FF');
}

export function isFuneralProductCategory(
    category: string | null | undefined
): boolean {
    const c = String(category || '').trim().toLowerCase();
    return c === 'funerale' || c === 'ff' || c === 'funeral';
}
