/**
 * Glossario fiscale/contabile italiano per UI Contabilità e export.
 * Traduce stati di riconciliazione, tipi fonte e etichette tecniche inglesi.
 */

const RECONCILIATION_IT: Record<string, string> = {
    MATCHED: 'Riconciliato',
    RECONCILED: 'Riconciliato',
    PARTIAL: 'Parzialmente riconciliato',
    UNMATCHED: 'In attesa di quadratura',
    PENDING: 'In attesa di quadratura',
    'N/A': 'Non applicabile',
    NA: 'Non applicabile',
    MANUAL: 'Registrazione manuale',
    MANUAL_ENTRY: 'Registrazione manuale',
    BANK_STATEMENT: 'Da estratto conto',
    SDI_INVOICE: 'Fattura elettronica SDI',
};

const SOURCE_TYPE_IT: Record<string, string> = {
    ORDER: 'Ordine web',
    BANK_LINE: 'Da estratto conto',
    STRIPE_MOVEMENT: 'Movimento Stripe',
    PAYPAL_MOVEMENT: 'Movimento PayPal',
    FLORIST_PAYOUT: 'Compenso fiorista',
    MANUAL_EXPENSE: 'Registrazione manuale',
    SAAS_INVOICE: 'Fattura SaaS',
    JSON_ENTRY: 'Registrazione manuale',
    CUSTOMER_RECEIPT: 'Ricevuta cliente',
    SDI_INVOICE: 'Fattura elettronica SDI',
    MANUAL_ENTRY: 'Registrazione manuale',
    BANK_STATEMENT: 'Da estratto conto',
};

function normalizeKey(raw: string): string {
    return raw
        .trim()
        .replace(/[\s-]+/g, '_')
        .toUpperCase();
}

/**
 * Stato riconciliazione → etichetta italiana (fallback leggibile se sconosciuto).
 */
export function labelReconciliationStatusIt(status?: string | null): string {
    if (status == null || String(status).trim() === '') return '—';
    const key = normalizeKey(String(status));
    if (RECONCILIATION_IT[key]) return RECONCILIATION_IT[key];

    const lower = String(status).trim().toLowerCase();
    if (lower === 'reconciled' || lower === 'matched') return 'Riconciliato';
    if (lower === 'pending' || lower === 'unmatched') return 'In attesa di quadratura';
    if (lower === 'partial') return 'Parzialmente riconciliato';
    if (lower === 'manual_entry' || lower === 'manual') return 'Registrazione manuale';
    if (lower === 'bank_statement') return 'Da estratto conto';
    if (lower === 'sdi_invoice') return 'Fattura elettronica SDI';

    // Già in italiano o codice custom: capitalizza in modo leggibile
    if (/[a-zàèéìòù]/.test(String(status)) && !/[A-Z]{3,}/.test(String(status))) {
        return String(status);
    }
    return String(status)
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());
}

/** Tipo fonte ledger → etichetta italiana. */
export function labelSourceTypeIt(sourceType?: string | null): string {
    if (!sourceType) return '—';
    const key = normalizeKey(sourceType);
    return SOURCE_TYPE_IT[key] || labelReconciliationStatusIt(sourceType);
}
