/**
 * Autofatture estere TD17/TD18/TD19 + matching SaaS su estratto Fineco.
 * Perché: reverse charge su servizi/beni esteri deve essere riconoscibile in Contabilità
 * e abbinabile agli addebiti carta/bonifici (Vercel, Google, Stripe, …).
 */

export const FOREIGN_AUTOFATTURA_TYPES = ['TD17', 'TD18', 'TD19'] as const;
export type ForeignAutofatturaType = (typeof FOREIGN_AUTOFATTURA_TYPES)[number];

export const FOREIGN_AUTOFATTURA_SOURCE = 'SDI_AUTOFATTURA_ESTERA' as const;

/** Vendor tipici addebitati su Fineco (carta/bonifico). */
export const SAAS_FOREIGN_VENDOR_RE =
    /\b(VERCEL|GOOGLE(\s*CLOUD|\s*IRELAND|\s*PAYMENT)?|STRIPE|GITHUB|OPENAI|AWS|AMAZON\s*WEB|META(\s*PLATFORMS)?|FACEBOOK|CURSOR|ANYSPHERE|ANTHROPIC|CLAUDE|MICROSOFT|AZURE|CLOUDFLARE|DIGITALOCEAN|HEROKU|NOTION|SLACK|FIGMA|LINEAR|DATADOG|SENTRY)\b/i;

export function isForeignAutofatturaTipo(tipo: string | null | undefined): boolean {
    const t = String(tipo || '')
        .toUpperCase()
        .replace(/\s+/g, '');
    return FOREIGN_AUTOFATTURA_TYPES.some((code) => t.includes(code));
}

/** Paese da P.IVA normalizzata (IT123… → IT). */
export function vendorCountryFromVat(vat: string | null | undefined): string | null {
    if (!vat) return null;
    const v = String(vat).replace(/\s+/g, '').toUpperCase();
    const m = v.match(/^([A-Z]{2})/);
    return m ? m[1] : null;
}

export function isForeignVendorVat(vat: string | null | undefined): boolean {
    const country = vendorCountryFromVat(vat);
    if (!country) return false;
    return country !== 'IT';
}

export function classifySaasCategory(
    vendorName: string,
    description?: string
): 'Software & Servizi SaaS Estero' | 'Hosting / Infrastruttura' {
    const blob = `${vendorName} ${description || ''}`.toUpperCase();
    if (/VERCEL|AWS|AMAZON|CLOUDFLARE|DIGITALOCEAN|HEROKU|AZURE|HOST|SERVER|INFRA/.test(blob)) {
        return 'Hosting / Infrastruttura';
    }
    return 'Software & Servizi SaaS Estero';
}

export function resolveAutofatturaType(
    tipoDocumento: string | null | undefined
): ForeignAutofatturaType | null {
    const t = String(tipoDocumento || '')
        .toUpperCase()
        .replace(/\s+/g, '');
    if (t.includes('TD19')) return 'TD19';
    if (t.includes('TD18')) return 'TD18';
    if (t.includes('TD17')) return 'TD17';
    return null;
}

export function detectForeignAutofattura(input: {
    tipoDocumento?: string | null;
    vendorVat?: string | null;
    vendorName?: string | null;
    causale?: string | null;
}): {
    isForeignAutofattura: boolean;
    tipoDocumento: string | null;
    autofatturaType: ForeignAutofatturaType | null;
    isReverseCharge: boolean;
    category: 'Software & Servizi SaaS Estero' | 'Hosting / Infrastruttura' | null;
} {
    const tipoDocumento = input.tipoDocumento
        ? String(input.tipoDocumento).toUpperCase().trim()
        : null;
    const fromTd = isForeignAutofatturaTipo(tipoDocumento);
    const fromVat = isForeignVendorVat(input.vendorVat);
    const fromVendor = SAAS_FOREIGN_VENDOR_RE.test(
        `${input.vendorName || ''} ${input.causale || ''}`
    );
    const isForeignAutofattura = fromTd || fromVat || (fromVendor && fromVat);
    // Reverse charge: TD17/18/19 oppure fornitore estero su servizi SaaS noti
    const isReverseCharge = fromTd || (fromVat && (fromVendor || fromTd));
    const autofatturaType =
        resolveAutofatturaType(tipoDocumento) ||
        (isForeignAutofattura ? ('TD17' as const) : null);

    return {
        isForeignAutofattura: Boolean(isForeignAutofattura || isReverseCharge),
        tipoDocumento,
        autofatturaType,
        isReverseCharge: Boolean(isReverseCharge || fromTd),
        category: isForeignAutofattura || isReverseCharge
            ? classifySaasCategory(input.vendorName || '', input.causale || '')
            : null,
    };
}

export function bankDescriptionMatchesSaasVendor(
    bankDescription: string,
    vendorName: string
): boolean {
    const desc = bankDescription.toUpperCase();
    if (SAAS_FOREIGN_VENDOR_RE.test(desc)) {
        const vendor = vendorName.toUpperCase();
        // Match se la descrizione cita il vendor o un token SaaS comune al vendor
        if (SAAS_FOREIGN_VENDOR_RE.test(vendor) && SAAS_FOREIGN_VENDOR_RE.test(desc)) {
            const vendorTokens = vendor.split(/[^A-Z0-9]+/).filter((t) => t.length > 3);
            if (vendorTokens.some((t) => desc.includes(t))) return true;
            // Stesso ecosistema (es. vendor Vercel + desc VERCEL)
            const saasHit = desc.match(SAAS_FOREIGN_VENDOR_RE);
            const vendorHit = vendor.match(SAAS_FOREIGN_VENDOR_RE);
            if (saasHit && vendorHit && saasHit[1].toUpperCase() === vendorHit[1].toUpperCase()) {
                return true;
            }
        }
    }
    const tokens = vendorName
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^A-Z0-9]+/)
        .filter((t) => t.length > 3);
    return tokens.slice(0, 4).some((t) => desc.includes(t));
}

export function autofatturaBadgeLabel(tipo?: string | null): string {
    const t = String(tipo || '').toUpperCase();
    if (t.includes('TD18')) return 'Autofattura Estera (TD18)';
    if (t.includes('TD19')) return 'Autofattura Estera (TD19)';
    return 'Autofattura Estera (TD17/TD18)';
}
