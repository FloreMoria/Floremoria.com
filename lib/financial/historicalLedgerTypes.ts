/**
 * Tipi e helpers del Registro Storico Permanente Contabile.
 */

export const LEDGER_CATEGORIES = [
    'RICAVI_VENDITE',
    'ALTRI_RICAVI',
    'RIMBORSI',
    'PAYPAL_PAYOUT',
    /** Giroconto gateway → banca Fineco: non è ricavo di vendita. */
    'TRASFERIMENTO_INTERNO',
    'COSTI_FIORISTI',
    'SPESE_SAAS',
    'SPESE_OPERATIVE',
    'ONERI_BANCARI',
    'CONSULENZE',
    'IMPOSTE',
    'ALTRI_COSTI',
] as const;

export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];
export type LedgerDirection = 'ENTRATA' | 'USCITA';
export type LedgerSourceType =
    | 'ORDER'
    | 'FLORIST_PAYOUT'
    | 'BANK_LINE'
    | 'MANUAL_EXPENSE'
    | 'SAAS_INVOICE'
    | 'STRIPE_MOVEMENT'
    | 'PAYPAL_MOVEMENT'
    | 'CUSTOMER_RECEIPT'
    | 'JSON_ENTRY'
    | 'REVERSAL';

export type LedgerEntryInput = {
    sourceKey: string;
    sourceType: LedgerSourceType;
    sourceId: string;
    direction: LedgerDirection;
    category: LedgerCategory;
    accountingDate: Date;
    valueDate?: Date | null;
    description: string;
    counterpartyName?: string | null;
    counterpartyVat?: string | null;
    netCents: number;
    vatRate?: number;
    vatCents?: number;
    /** Firmato: + entrate, − uscite */
    totalCents: number;
    reconciliationStatus?: string;
    documentRef?: string | null;
    attachmentUrl?: string | null;
    attachmentPath?: string | null;
    attachmentKind?: string | null;
    bankLineId?: string | null;
    orderId?: string | null;
    partnerId?: string | null;
    metadataJson?: Record<string, unknown> | null;
    reversesEntryId?: string | null;
};

export type HistoricalPnl = {
    fiscalYear: number;
    fiscalQuarter: number | null;
    /** Competenza fiscale: ricavi lordi di vendita (esclusi giroconti). */
    ricaviLordiCents: number;
    ricaviNettiCents: number;
    ivaDebitoCents: number;
    costiFioristiCents: number;
    /** Fatture passive SDI / spese documentate (MANUAL_EXPENSE), escluse SaaS. */
    costiFatturePassiveSdiCents: number;
    costiSaasCents: number;
    costiOperativiCents: number;
    /** Solo fioristi + fatture passive SDI (nessuna costante / SaaS / residuo). */
    costiProduzioneCents: number;
    ebitdaCents: number;
    oneriBancariCents: number;
    ivaCreditoCents: number;
    ivaNettaCents: number;
    risultatoAnteImposteCents: number;
    entriesCount: number;
    /**
     * Flusso di cassa reale (binario A): lordi Fineco + giroconti gateway.
     * Non mescolare con ricavi di competenza fiscale.
     */
    cashInflowCents?: number;
    cashOutflowCents?: number;
    cashGatewayTransferCents?: number;
    cashBankBalanceCents?: number;
};

export function fiscalParts(d: Date): {
    fiscalYear: number;
    fiscalQuarter: number;
    periodKey: string;
} {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const q = Math.ceil(m / 3);
    return {
        fiscalYear: y,
        fiscalQuarter: q,
        periodKey: `${y}-${String(m).padStart(2, '0')}`,
    };
}

export function categorizeManualExpense(opts: {
    vendorName: string;
    description: string;
    metadata?: Record<string, unknown> | null;
}): LedgerCategory {
    const meta = opts.metadata || {};
    const source = String(meta.source || '');
    const blob = `${opts.vendorName} ${opts.description} ${source}`.toUpperCase();
    if (
        source === 'SDI_AUTOFATTURA_ESTERA' ||
        source === 'AUTOFATTURA_TD17' ||
        source === 'AUTOFATTURA_TD18' ||
        meta.isReverseCharge ||
        meta.isForeignAutofattura
    ) {
        return 'SPESE_SAAS';
    }
    if (source.startsWith('SDI') || /FATTURA|SDI|YOUDOOX/.test(blob)) {
        if (/FIORIST|FIORER|BONIFICATO|PARTNER/.test(blob)) return 'COSTI_FIORISTI';
        return 'SPESE_OPERATIVE';
    }
    if (/CURSOR|VERCEL|OPENAI|ANTHROPIC|CLAUDE|ANTIGRAVITY|GOOGLE|META|AWS|SAAS|SOFTWARE/.test(blob)) {
        return 'SPESE_SAAS';
    }
    if (/FINECO|COMMISSION|CANONE|BOLLO|BANC/.test(blob)) return 'ONERI_BANCARI';
    if (/CONSULEN|COMMERCIALISTA|LEGALE|NOTAIO/.test(blob)) return 'CONSULENZE';
    if (/F24|IRES|IRAP|IVA|INPS|IMPOSTA|TRIBUT/.test(blob)) return 'IMPOSTE';
    return 'SPESE_OPERATIVE';
}

export function categorizeBankLine(description: string, matchType: string | null): LedgerCategory {
    const u = `${description} ${matchType || ''}`.toUpperCase();
    if (
        matchType === 'FLORIST_TRANSFER' ||
        matchType === 'FLORIST_INVOICE' ||
        matchType === 'FLORIST_ADVANCE' ||
        /FIORIST|COMPENSO|POSA|TOMBA|ANTICIPO/.test(u)
    ) {
        return 'COSTI_FIORISTI';
    }
    // Payout Stripe/PayPal su Fineco = partita di giro (non ricavo di vendita).
    if (
        matchType === 'STRIPE_PAYOUT' ||
        matchType === 'PAYPAL_PAYOUT' ||
        matchType === 'GATEWAY_PAYOUT' ||
        matchType === 'INTERNAL_TRANSFER' ||
        /\b(STRIPE|PAYPAL)\b/.test(u)
    ) {
        if (matchType === 'PAYPAL_CASHBACK' || /CASHBACK|RIMBORSO|REFUND|STORNO/.test(u)) {
            return 'RIMBORSI';
        }
        return 'TRASFERIMENTO_INTERNO';
    }
    if (matchType === 'PAYPAL_CASHBACK') return 'RIMBORSI';
    if (matchType === 'SAAS_SUBSCRIPTION' || /CURSOR|VERCEL|OPENAI|CLAUDE|GOOGLE|META|AWS/.test(u)) {
        return 'SPESE_SAAS';
    }
    if (matchType === 'BANK_FEE' || /COMMISSION|CANONE|BOLLO|SPESE\s*CONTO/.test(u)) {
        return 'ONERI_BANCARI';
    }
    if (/F24|ADE |AGENZIA|INPS|TRIBUT/.test(u)) return 'IMPOSTE';
    return 'SPESE_OPERATIVE';
}

/** True se la categoria non deve entrare nei ricavi/costi operativi di vendita. */
export function isInternalTransferCategory(category: string | null | undefined): boolean {
    return category === 'TRASFERIMENTO_INTERNO' || category === 'PAYPAL_PAYOUT';
}

export const CATEGORY_LABELS: Record<LedgerCategory, string> = {
    RICAVI_VENDITE: 'Ricavi vendite',
    ALTRI_RICAVI: 'Altri ricavi',
    RIMBORSI: 'Rimborsi ricevuti',
    PAYPAL_PAYOUT: 'Trasferimento PayPal → banca (giroconto)',
    TRASFERIMENTO_INTERNO: 'Partita di giro (gateway → Fineco)',
    COSTI_FIORISTI: 'Costi del venduto / Fioristi',
    SPESE_SAAS: 'Spese server / SaaS',
    SPESE_OPERATIVE: 'Spese operative',
    ONERI_BANCARI: 'Oneri bancari',
    CONSULENZE: 'Consulenze',
    IMPOSTE: 'Imposte / F24',
    ALTRI_COSTI: 'Altri costi',
};
