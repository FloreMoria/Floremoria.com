/**
 * Categorie movimento bancario Fineco (matchType) con vincoli sul segno.
 */

export type BankCategoryOption = {
    matchType: string;
    label: string;
    /** 'in' = solo entrate; 'out' = solo uscite; 'both' = entrambi */
    sign: 'in' | 'out' | 'both';
};

export const BANK_CATEGORY_OPTIONS: BankCategoryOption[] = [
    { matchType: 'GATEWAY_PAYOUT', label: 'Incasso gateway', sign: 'in' },
    { matchType: 'OTHER_REVENUE', label: 'Altro ricavo / Entrata', sign: 'in' },
    { matchType: 'FLORIST_TRANSFER', label: 'Compenso fiorista', sign: 'out' },
    { matchType: 'SDI_INVOICE', label: 'Fattura / fornitore', sign: 'out' },
    { matchType: 'CASH_EXPENSE', label: 'Spesa documentata', sign: 'out' },
    { matchType: 'BANK_FEE', label: 'Oneri bancari', sign: 'out' },
    { matchType: 'SAAS_SUBSCRIPTION', label: 'Canone / SaaS', sign: 'out' },
    { matchType: 'INTERNAL_TRANSFER', label: 'Giroconto', sign: 'both' },
];

/** Opzioni ammesse per il segno dell'importo (positivo = entrata). */
export function bankCategoriesForAmount(amountCents: number): BankCategoryOption[] {
    const want = amountCents >= 0 ? 'in' : 'out';
    return BANK_CATEGORY_OPTIONS.filter((o) => o.sign === 'both' || o.sign === want);
}

/** Se la categoria non è compatibile col segno, corregge alla default corretta. */
export function coerceBankCategoryForAmount(
    matchType: string | null | undefined,
    amountCents: number
): string {
    const allowed = bankCategoriesForAmount(amountCents);
    const current = (matchType || '').trim();
    if (allowed.some((o) => o.matchType === current)) return current;
    // Entrata non può restare Compenso fiorista / uscite
    if (amountCents >= 0) return 'OTHER_REVENUE';
    if (current.toUpperCase().includes('FLORIST')) return 'FLORIST_TRANSFER';
    return 'CASH_EXPENSE';
}

export function bankCategoryLabel(
    matchType: string | null | undefined,
    amountCents: number
): string {
    const coerced = coerceBankCategoryForAmount(matchType, amountCents);
    const hit = BANK_CATEGORY_OPTIONS.find((o) => o.matchType === coerced);
    if (hit) return hit.label;
    return amountCents >= 0 ? 'Entrata' : 'Uscita';
}
