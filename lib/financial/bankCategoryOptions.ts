/**
 * Categorie movimento bancario Fineco (matchType) con vincoli sul segno.
 * Entrate e uscite usano set semantici distinti (niente Giroconto in UI).
 */

export type BankCategoryOption = {
    matchType: string;
    label: string;
    /** 'in' = solo entrate; 'out' = solo uscite; 'both' = entrambi */
    sign: 'in' | 'out' | 'both';
};

export const BANK_CATEGORY_OPTIONS: BankCategoryOption[] = [
    // Entrate (+€)
    { matchType: 'STRIPE_PAYOUT', label: 'Incasso Stripe (Payout)', sign: 'in' },
    { matchType: 'PAYPAL_PAYOUT', label: 'Incasso PayPal (Payout)', sign: 'in' },
    { matchType: 'PAYPAL_CASHBACK', label: 'Cashback / Rimborsi PayPal', sign: 'in' },
    { matchType: 'OTHER_REVENUE', label: 'Altro Ricavo / Entrata Diretta', sign: 'in' },
    // Uscite (−€)
    { matchType: 'FLORIST_ADVANCE', label: 'Anticipo fiorista', sign: 'out' },
    { matchType: 'FLORIST_INVOICE', label: 'Fattura fiorista', sign: 'out' },
    { matchType: 'SDI_INVOICE', label: 'Fattura fornitore', sign: 'out' },
    { matchType: 'CASH_EXPENSE', label: 'Spesa documentata', sign: 'out' },
    { matchType: 'BANK_FEE', label: 'Oneri bancari', sign: 'out' },
    { matchType: 'SAAS_SUBSCRIPTION', label: 'Canone SaaS', sign: 'out' },
    { matchType: 'UNDOCUMENTED_EXPENSE', label: 'Spesa non documentata', sign: 'out' },
];

const SEPA_OUT_RE =
    /\b(bonifico|sepa|sct|transfer|ordinativo|disposizione\s+di\s+pagamento|bon\.?\s*sepa)\b/i;
const CARD_ECOM_RE =
    /\b(carta|pos|bancomat|maestro|visa|mastercard|pagamento\s+elettronico|google\s+pay|apple\s+pay|pagamento\s+con\s+carta|addebito\s+carta)\b/i;
const SAAS_VENDOR_RE =
    /\b(cursor|vercel|openai|anthropic|claude|github|notion|slack|figma|adobe|canva|mailchimp|aws|digitalocean|hetzner|cloudflare|google\s*workspace|microsoft\s*365|office\s*365|zoom|dropbox|hubspot|linear|supabase|neon|planetscale)\b/i;
const PAYPAL_CASHBACK_RE = /\b(cashback|rimborso|refund|storno|rebate|cash\s*back)\b/i;
const ANTICIPO_RE = /\banticipo\b/i;
const BANK_FEE_HINT_RE =
    /(imposta\s+(di\s+)?bollo|canone(\s+mensile|\s+annuale)?(\s+conto)?|spese\s+(di\s+)?tenuta|commissioni|competenze(\s+e\s+spese)?|ritenute\s+fiscali|\bf24\b|agenzia\s+delle\s+entrate)/i;
const DOCUMENTED_EXPENSE_RE =
    /\b(scontrino|ricevuta|fattura|documento|td0[1-9]|autofattura)\b/i;

/** Alias legacy → categoria canoniche del set attuale. */
const LEGACY_MATCH_TYPE_MAP: Record<string, string> = {
    GATEWAY_PAYOUT: 'OTHER_REVENUE',
    GATEWAY_PAYOUT_UNMATCHED: 'OTHER_REVENUE',
    INFLOW: 'OTHER_REVENUE',
    OUTFLOW: 'UNDOCUMENTED_EXPENSE',
    FLORIST_TRANSFER: 'FLORIST_INVOICE',
    INTERNAL_TRANSFER: 'UNDOCUMENTED_EXPENSE',
    MANUAL_EXPENSE: 'SDI_INVOICE',
    FOREIGN_AUTOFATTURA: 'SDI_INVOICE',
    TAX_PAYMENT: 'BANK_FEE',
    MANUAL_MATCH: 'UNDOCUMENTED_EXPENSE',
};

/** Opzioni ammesse per il segno dell'importo (positivo = entrata). */
export function bankCategoriesForAmount(amountCents: number): BankCategoryOption[] {
    const want = amountCents >= 0 ? 'in' : 'out';
    return BANK_CATEGORY_OPTIONS.filter((o) => o.sign === 'both' || o.sign === want);
}

/**
 * Normalizza matchType legacy/hint verso il set UI, poi vincola al segno.
 */
export function coerceBankCategoryForAmount(
    matchType: string | null | undefined,
    amountCents: number,
    description?: string | null
): string {
    const allowed = bankCategoriesForAmount(amountCents);
    let current = (matchType || '').trim();

    // Alias legacy
    if (LEGACY_MATCH_TYPE_MAP[current]) {
        current = LEGACY_MATCH_TYPE_MAP[current];
    }
    // INTERNAL in entrata → altro ricavo
    if ((matchType || '').trim() === 'INTERNAL_TRANSFER' && amountCents >= 0) {
        current = 'OTHER_REVENUE';
    }
    // Gateway generico: spezza Stripe / PayPal se la causale è nota
    if (
        (matchType === 'GATEWAY_PAYOUT' || matchType === 'GATEWAY_PAYOUT_UNMATCHED') &&
        description
    ) {
        const suggested = suggestBankCategoryFromDescription(amountCents, description);
        if (
            suggested === 'STRIPE_PAYOUT' ||
            suggested === 'PAYPAL_PAYOUT' ||
            suggested === 'PAYPAL_CASHBACK'
        ) {
            current = suggested;
        }
    }

    if (allowed.some((o) => o.matchType === current)) return current;

    // Heuristica da causale se ancora fuori set
    if (description) {
        const fromDesc = suggestBankCategoryFromDescription(amountCents, description);
        if (allowed.some((o) => o.matchType === fromDesc)) return fromDesc;
    }

    if (amountCents >= 0) return 'OTHER_REVENUE';
    if (/FLORIST|FIORIST/i.test(current)) return 'FLORIST_INVOICE';
    return 'UNDOCUMENTED_EXPENSE';
}

export function bankCategoryLabel(
    matchType: string | null | undefined,
    amountCents: number,
    description?: string | null
): string {
    const coerced = coerceBankCategoryForAmount(matchType, amountCents, description);
    const hit = BANK_CATEGORY_OPTIONS.find((o) => o.matchType === coerced);
    if (hit) return hit.label;
    return amountCents >= 0 ? 'Entrata' : 'Uscita';
}

/**
 * Regole di riconoscimento automatico da causale (bonifici SEPA, carta/SaaS, payout gateway).
 */
export function suggestBankCategoryFromDescription(
    amountCents: number,
    description: string
): string {
    const u = description || '';

    if (amountCents >= 0) {
        if (/\bstripe\b/i.test(u)) return 'STRIPE_PAYOUT';
        if (/\bpaypal\b/i.test(u)) {
            if (PAYPAL_CASHBACK_RE.test(u)) return 'PAYPAL_CASHBACK';
            return 'PAYPAL_PAYOUT';
        }
        if (PAYPAL_CASHBACK_RE.test(u)) return 'PAYPAL_CASHBACK';
        return 'OTHER_REVENUE';
    }

    // Uscite
    if (BANK_FEE_HINT_RE.test(u)) return 'BANK_FEE';
    if (ANTICIPO_RE.test(u) && (SEPA_OUT_RE.test(u) || /FIORIST|BEN:|BENEFICIARIO/i.test(u))) {
        return 'FLORIST_ADVANCE';
    }
    if (SEPA_OUT_RE.test(u) || /FIORIST|BEN:|BENEFICIARIO|ORDINE\s*PT-/i.test(u)) {
        return 'FLORIST_INVOICE';
    }
    if (SAAS_VENDOR_RE.test(u) || (CARD_ECOM_RE.test(u) && !DOCUMENTED_EXPENSE_RE.test(u))) {
        return 'SAAS_SUBSCRIPTION';
    }
    if (/\bpaypal\b/i.test(u) && amountCents < 0) {
        return DOCUMENTED_EXPENSE_RE.test(u) ? 'CASH_EXPENSE' : 'SAAS_SUBSCRIPTION';
    }
    if (DOCUMENTED_EXPENSE_RE.test(u) || /FORNITOR|SDI|P\.?\s*IVA/i.test(u)) {
        return /FIORIST/i.test(u) ? 'FLORIST_INVOICE' : 'SDI_INVOICE';
    }
    if (CARD_ECOM_RE.test(u)) return 'CASH_EXPENSE';
    return 'UNDOCUMENTED_EXPENSE';
}

export function isFloristBankCategory(matchType: string | null | undefined): boolean {
    const t = (matchType || '').trim();
    return (
        t === 'FLORIST_INVOICE' ||
        t === 'FLORIST_ADVANCE' ||
        t === 'FLORIST_TRANSFER'
    );
}
