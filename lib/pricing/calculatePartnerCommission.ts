/**
 * Fee partner/aggregatore: % configurabile sul lordo cliente (IVA inclusa),
 * scomposizione imponibile/IVA 22% (provvigione, non aliquota fiori 10%).
 *
 * Su €100 di ordine con 10%: fee €10,00 · imponibile €8,20 · IVA €1,80.
 * Arrotondamento: half-up al centesimo sul lordo fee; imponibile = round(lordo/1,22);
 * IVA = lordo − imponibile (nessun secondo arrotondamento).
 */
export const PARTNER_FEE_VAT_RATE = 0.22;

export type PartnerCommissionBreakdown = {
    /** Lordo fee IVA inclusa (centesimi) — numero autorevole per-ordine. */
    grossCents: number;
    /** Imponibile (centesimi). */
    taxableCents: number;
    /** IVA 22% (centesimi). */
    vatCents: number;
};

export function calculatePartnerCommissionBreakdown(
    totalPriceCents: number,
    percentInclusive: number
): PartnerCommissionBreakdown {
    if (!Number.isFinite(totalPriceCents) || totalPriceCents <= 0) {
        return { grossCents: 0, taxableCents: 0, vatCents: 0 };
    }
    if (!Number.isFinite(percentInclusive) || percentInclusive <= 0) {
        return { grossCents: 0, taxableCents: 0, vatCents: 0 };
    }

    const grossCents = Math.round((totalPriceCents * percentInclusive) / 100);
    const taxableCents = Math.round(grossCents / (1 + PARTNER_FEE_VAT_RATE));
    const vatCents = grossCents - taxableCents;
    return { grossCents, taxableCents, vatCents };
}

/** @deprecated Preferire calculatePartnerCommissionBreakdown con % dal Partner. */
export function calculatePartnerCommissionCents(totalPriceCents: number, percentInclusive = 10): number {
    return calculatePartnerCommissionBreakdown(totalPriceCents, percentInclusive).grossCents;
}

export function formatPartnerCommissionEuros(cents: number | null | undefined): string {
    if (cents == null || !Number.isFinite(cents)) return '€0,00';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/**
 * Storno fee su rimborso/cancellazione: stessi importi con segno negativo
 * (il chiamante registra il delta e aggiorna PartnerFeeMonthClose).
 */
export function reversePartnerCommission(
    breakdown: PartnerCommissionBreakdown
): PartnerCommissionBreakdown {
    return {
        grossCents: -breakdown.grossCents,
        taxableCents: -breakdown.taxableCents,
        vatCents: -breakdown.vatCents,
    };
}
