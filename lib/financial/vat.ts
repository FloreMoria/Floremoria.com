/**
 * Scorporo IVA FloreMoria — aliquote in punti percentuali interi (10 / 22).
 * Perché: evitare Float non deterministici nei totali di periodo e nei registri.
 *
 * Matrice fiscale:
 * - 10%: omaggi floreali, bouquet, composizioni, compensi fioristi
 * - 22%: accessori, servizi, struttura, SaaS/esteri (reverse charge)
 */

/** Aliquota ridotta fiori/omaggi (DPR 633/72) — punti percentuali. */
export const VAT_PCT_FLORAL = 10;
/** Aliquota ordinaria — punti percentuali. */
export const VAT_PCT_ORDINARY = 22;

/** @deprecated Preferire VAT_PCT_FLORAL (intero). Mantenuto per call-site legacy. */
export const VAT_RATE_FLORAL = 0.1;
/** @deprecated Preferire VAT_PCT_ORDINARY (intero). */
export const VAT_RATE_ORDINARY = 0.22;

export type VatBreakdown = {
    grossCents: number;
    imponibileCents: number;
    ivaCents: number;
    /** Punti percentuali (10 | 22 | …). */
    rate: number;
};

/**
 * Normalizza aliquota legacy (0.1 / 0.22) o già in punti (10 / 22) → punti percentuali interi.
 */
export function normalizeVatRatePercent(rate: number | null | undefined): number {
    if (rate == null || !Number.isFinite(rate) || rate === 0) return 0;
    if (rate > 0 && rate <= 1) return Math.round(rate * 100);
    return Math.round(rate);
}

/** Imponibile = Lordo / (1+rate%), IVA = Lordo − Imponibile (arrotondamento al centesimo). */
export function scorporaIva(grossCents: number, ratePercent: number): VatBreakdown {
    const gross = Math.round(grossCents);
    const rate = normalizeVatRatePercent(ratePercent);
    if (!Number.isFinite(gross) || gross === 0 || rate <= 0) {
        return { grossCents: gross || 0, imponibileCents: gross || 0, ivaCents: 0, rate };
    }
    const sign = gross < 0 ? -1 : 1;
    const abs = Math.abs(gross);
    const imponibileAbs = Math.round(abs / (1 + rate / 100));
    const ivaAbs = abs - imponibileAbs;
    return {
        grossCents: sign * abs,
        imponibileCents: sign * imponibileAbs,
        ivaCents: sign * ivaAbs,
        rate,
    };
}

/** Aliquota 10% sui prodotti floreali (default categoria FloreMoria). */
export function scorporaIvaFloreale(grossCents: number): VatBreakdown {
    return scorporaIva(grossCents, VAT_PCT_FLORAL);
}

/** Aliquota ordinaria 22% (accessori / servizi / struttura). */
export function scorporaIvaOrdinaria(grossCents: number): VatBreakdown {
    return scorporaIva(grossCents, VAT_PCT_ORDINARY);
}

/**
 * Scorpora un totale vendita: se `accessoryCents` > 0 applica 22% su quella quota
 * e 10% sul resto; altrimenti tutto al 10% di categoria.
 */
export function scorporaVenditaFloreale(params: {
    grossCents: number;
    accessoryCents?: number;
}): VatBreakdown & { floral: VatBreakdown; accessory: VatBreakdown | null } {
    const gross = Math.round(params.grossCents);
    const accessoryRaw = Math.round(params.accessoryCents ?? 0);
    const accessoryCents = Math.min(Math.max(accessoryRaw, 0), Math.abs(gross));

    if (accessoryCents <= 0) {
        const floral = scorporaIvaFloreale(gross);
        return { ...floral, floral, accessory: null };
    }

    const floralGross = gross - accessoryCents;
    const floral = scorporaIvaFloreale(floralGross);
    const accessory = scorporaIvaOrdinaria(accessoryCents);

    return {
        grossCents: floral.grossCents + accessory.grossCents,
        imponibileCents: floral.imponibileCents + accessory.imponibileCents,
        ivaCents: floral.ivaCents + accessory.ivaCents,
        rate: VAT_PCT_FLORAL,
        floral,
        accessory,
    };
}

/** True se slug/nome categoria suggerisce accessorio/servizio (non fiore). */
export function isAccessoryCategory(slugOrName: string | null | undefined): boolean {
    if (!slugOrName?.trim()) return false;
    const s = slugOrName.toLowerCase();
    return (
        s.includes('accessor') ||
        s.includes('nastro') ||
        s.includes('bigliett') ||
        s.includes('serviz') ||
        s.includes('consegna-extra') ||
        s.includes('logistica') ||
        s.includes('lumino') ||
        s.includes('cero') ||
        s.includes('candela')
    );
}

export function formatEuroFromCents(cents: number): string {
    return (Math.round(cents) / 100).toFixed(2).replace('.', ',');
}

/** Euro float (Stripe Order.grossAmount) → centesimi interi. */
export function euroFloatToCents(value: number | null | undefined): number {
    if (value == null || !Number.isFinite(value)) return 0;
    return Math.round(value * 100);
}
