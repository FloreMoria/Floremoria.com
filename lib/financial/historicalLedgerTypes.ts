/**
 * Tipi e helpers del Registro Storico Permanente Contabile.
 */

export const LEDGER_CATEGORIES = [
    'RICAVI_VENDITE',
    'ALTRI_RICAVI',
    'RIMBORSI',
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
    ricaviLordiCents: number;
    ricaviNettiCents: number;
    ivaDebitoCents: number;
    costiFioristiCents: number;
    costiSaasCents: number;
    costiOperativiCents: number;
    costiProduzioneCents: number;
    ebitdaCents: number;
    oneriBancariCents: number;
    ivaCreditoCents: number;
    ivaNettaCents: number;
    risultatoAnteImposteCents: number;
    entriesCount: number;
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
    if (matchType === 'FLORIST_TRANSFER' || /FIORIST|COMPENSO|POSA|TOMBA/.test(u)) return 'COSTI_FIORISTI';
    if (matchType === 'GATEWAY_PAYOUT' || /STRIPE|PAYPAL/.test(u)) return 'RICAVI_VENDITE';
    if (matchType === 'BANK_FEE' || /COMMISSION|CANONE|BOLLO|SPESE\s*CONTO/.test(u)) return 'ONERI_BANCARI';
    if (/CURSOR|VERCEL|OPENAI|CLAUDE|GOOGLE|META|AWS/.test(u)) return 'SPESE_SAAS';
    if (/F24|ADE |AGENZIA|INPS|TRIBUT/.test(u)) return 'IMPOSTE';
    return 'SPESE_OPERATIVE';
}

export const CATEGORY_LABELS: Record<LedgerCategory, string> = {
    RICAVI_VENDITE: 'Ricavi vendite',
    ALTRI_RICAVI: 'Altri ricavi',
    RIMBORSI: 'Rimborsi ricevuti',
    COSTI_FIORISTI: 'Costi del venduto / Fioristi',
    SPESE_SAAS: 'Spese server / SaaS',
    SPESE_OPERATIVE: 'Spese operative',
    ONERI_BANCARI: 'Oneri bancari',
    CONSULENZE: 'Consulenze',
    IMPOSTE: 'Imposte / F24',
    ALTRI_COSTI: 'Altri costi',
};
