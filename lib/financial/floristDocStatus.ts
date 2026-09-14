/**
 * Tipi e helper stato documento fiorista — safe per Client Components.
 * Nessun import Prisma / mail.
 */

export const FLORIST_DOC_STATUSES = [
    'WAITING_INVOICE',
    'INVOICE_ASSOCIATED',
    'RECEIPT_ASSOCIATED',
    'NOT_DUE',
    'CANCELLED',
] as const;

export type FloristDocStatus = (typeof FLORIST_DOC_STATUSES)[number];

export const FLORIST_DOC_STATUS_LABELS: Record<FloristDocStatus, string> = {
    WAITING_INVOICE: 'In attesa fattura',
    INVOICE_ASSOCIATED: 'Fattura Associata',
    RECEIPT_ASSOCIATED: 'Scontrino Associato',
    NOT_DUE: 'Non dovuto/Altro',
    CANCELLED: 'Annullato',
};

/** Mirror tipizzato di FloristInvoiceMatch — evita import server-only nel client. */
export type FloristAutoMatchedInvoice = {
    expenseId: string;
    invoiceNumber: string | null;
    invoiceDate: string;
    totalCents: number;
    vendorName: string;
    vendorVat: string | null;
    confidence: 'ORDER_REF' | 'VAT_AMOUNT' | 'VAT_AGGREGATED' | 'NAME_AMOUNT';
};

export type FloristCompensationRow = {
    id: string;
    orderId: string;
    orderNumber: string | null;
    partnerId: string | null;
    partnerName: string;
    partnerVat: string | null;
    partnerEmail: string | null;
    partnerWhatsapp: string | null;
    orderDate: string;
    amountCents: number;
    daysSinceOrder: number;
    docStatus: FloristDocStatus;
    statusLabel: string;
    receiptUrl: string | null;
    receiptPath: string | null;
    linkedExpenseId: string | null;
    linkedExpenseDocType: string | null;
    notes: string | null;
    bankLineId: string | null;
    documentId: string | null;
    floristSettlementStatus: string;
    /** Match calcolato in lettura (YouDOX/SDI) — non persistito finché non confermato. */
    autoMatchedInvoice: FloristAutoMatchedInvoice | null;
    matchSource: 'manual' | 'auto' | null;
};

export function isFloristDocStatus(value: unknown): value is FloristDocStatus {
    return (
        typeof value === 'string' &&
        (FLORIST_DOC_STATUSES as readonly string[]).includes(value)
    );
}

/**
 * Data di riferimento fiscale/operativa: sempre deliveryDate se valorizzata
 * (anche se createdAt è successivo — tipico degli insert .eu in dashboard .com).
 * createdAt è amministrativo; non va preferito quando esiste la consegna.
 */
export function orderReferenceDate(
    order: { createdAt: Date; deliveryDate: Date | null },
    _now = new Date()
): Date {
    if (order.deliveryDate) return order.deliveryDate;
    return order.createdAt;
}

export function resolveFloristDocStatus(input: {
    flags: Record<string, unknown>;
    floristSettlementStatus: string;
    linkedExpenseDocType: string | null;
    orderStatus: string;
    /** Match automatico passivo (sola lettura) — non sovrascrive decisioni manuali. */
    autoMatchedInvoice?: FloristAutoMatchedInvoice | null;
}): FloristDocStatus {
    // 1) Forzatura manuale vince sempre
    if (isFloristDocStatus(input.flags.floristDocStatus)) {
        return input.flags.floristDocStatus;
    }
    // 2) Annullato / non dovuto
    if (input.orderStatus === 'CANCELLED') return 'CANCELLED';
    if (input.flags.floristMissingDismissedAt) return 'NOT_DUE';

    // 3) Associazione manuale a ManualFinanceExpense
    const docType = (input.linkedExpenseDocType || '').toUpperCase();
    if (docType === 'SCONTRINO' || docType === 'RICEVUTA') return 'RECEIPT_ASSOCIATED';
    if (docType === 'FATTURA') return 'INVOICE_ASSOCIATED';
    if (input.floristSettlementStatus === 'RICEVUTA') return 'INVOICE_ASSOCIATED';

    // 4) Incrocio automatico con fattura passiva SDI/YouDOX
    if (input.autoMatchedInvoice) return 'INVOICE_ASSOCIATED';

    return 'WAITING_INVOICE';
}
