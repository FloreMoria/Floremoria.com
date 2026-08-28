/**
 * Fee partner/agenzia: 10% del valore totale ordine (IVA compresa), arrotondamento all'euro superiore.
 */
export function calculatePartnerCommissionCents(totalPriceCents: number): number {
    if (!Number.isFinite(totalPriceCents) || totalPriceCents <= 0) return 0;
    const feeEuros = Math.ceil((totalPriceCents / 100) * 0.1);
    return feeEuros * 100;
}

export function formatPartnerCommissionEuros(cents: number | null | undefined): string {
    if (cents == null || !Number.isFinite(cents)) return '€0,00';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
