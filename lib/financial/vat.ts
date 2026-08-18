/**
 * Scorporo IVA FloreMoria.
 * Categoria standard fiori/omaggi floreali: aliquota ridotta 10% (DPR 633/72).
 * Accessori/servizi extra scorporati: ordinaria 22%.
 */

export const VAT_RATE_FLORAL = 0.1;
export const VAT_RATE_ORDINARY = 0.22;

export type VatBreakdown = {
    grossCents: number;
    imponibileCents: number;
    ivaCents: number;
    rate: number;
};

/** Imponibile = Lordo / (1+rate), IVA = Lordo − Imponibile (arrotondamento al centesimo). */
export function scorporaIva(grossCents: number, rate: number): VatBreakdown {
    const gross = Math.round(grossCents);
    if (!Number.isFinite(gross) || gross === 0) {
        return { grossCents: 0, imponibileCents: 0, ivaCents: 0, rate };
    }
    const sign = gross < 0 ? -1 : 1;
    const abs = Math.abs(gross);
    const imponibileAbs = Math.round(abs / (1 + rate));
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
    return scorporaIva(grossCents, VAT_RATE_FLORAL);
}

/** Aliquota ordinaria 22% (accessori / servizi extra). */
export function scorporaIvaOrdinaria(grossCents: number): VatBreakdown {
    return scorporaIva(grossCents, VAT_RATE_ORDINARY);
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
        rate: VAT_RATE_FLORAL,
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
        s.includes('logistica')
    );
}

export function formatEuroFromCents(cents: number): string {
    return (cents / 100).toFixed(2).replace('.', ',');
}
