/**
 * Tipi rendiconti FinecoBank — Contabilità.
 * Assumption: export Fineco CSV/XLSX usano colonne IT (Data contabile/valuta, Entrate/Uscite, Saldo).
 */

export type BankStatementStatus =
    | 'UPLOADED'
    | 'PARSING'
    | 'PARSED'
    | 'RECONCILED'
    | 'FAILED';

export type BankStatementMatchStatus = 'MATCHED' | 'UNMATCHED' | 'PARTIAL';

export type ParsedBankMovement = {
    lineIndex: number;
    valueDate: string | null; // ISO date YYYY-MM-DD
    accountingDate: string | null;
    description: string;
    /** +avere / -dare in centesimi */
    amountCents: number;
    debitCents: number | null;
    creditCents: number | null;
    balanceCents: number | null;
    raw?: Record<string, unknown>;
};

export type ParseBankStatementAnomaly = {
    code: string;
    message: string;
    /** info = nota a margine; warn = dato parziale; error = problema serio */
    severity?: 'info' | 'warn' | 'error';
    page?: number;
    lineIndex?: number;
    raw?: string;
};

export type ParseBankStatementResult = {
    movements: ParsedBankMovement[];
    periodStart: string | null;
    periodEnd: string | null;
    /** Saldo di apertura del rendiconto (se presente nel PDF/CSV). */
    openingBalanceCents: number | null;
    closingBalanceCents: number | null;
    warnings: string[];
    /** Prime N righe di testo PDF per calibrazione pattern (solo se parsing debole/fallito). */
    textPreview?: string[];
    /** Anomalie non bloccanti (righe saltate, oneri senza importo, ecc.). */
    anomalies?: ParseBankStatementAnomaly[];
    /** Note a margine/footer escluse in silenzio. */
    ignoredMarginNotes?: number;
    /** Messaggio informativo tipo «69 movimenti • 6 note a margine escluse». */
    parseSummary?: string;
};

export type StatementMatchResult = {
    matchStatus: BankStatementMatchStatus;
    matchType: string | null;
    matchScore: number;
    matchedTxId: string | null;
    matchedOrderId: string | null;
    matchNotes: string;
};

export type BankReconciliationReport = {
    documentId: string | null;
    fileName: string | null;
    status: BankStatementStatus | null;
    periodStart: string | null;
    periodEnd: string | null;
    bankClosingBalanceCents: number | null;
    ledgerBalanceCents: number;
    stripeProxyCashCents: number;
    deltaBankVsLedgerCents: number;
    matchedCount: number;
    unmatchedCount: number;
    unmatchedSample: Array<{
        id: string;
        date: string | null;
        description: string;
        amountCents: number;
        matchNotes: string | null;
    }>;
    asOf: string;
};
