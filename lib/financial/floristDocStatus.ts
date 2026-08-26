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
};

export function isFloristDocStatus(value: unknown): value is FloristDocStatus {
    return (
        typeof value === 'string' &&
        (FLORIST_DOC_STATUSES as readonly string[]).includes(value)
    );
}

/**
 * Data di riferimento: consegna se già avvenuta, altrimenti createdAt.
 */
export function orderReferenceDate(
    order: { createdAt: Date; deliveryDate: Date | null },
    now = new Date()
): Date {
    if (order.deliveryDate && order.deliveryDate.getTime() <= now.getTime()) {
        return order.deliveryDate;
    }
    return order.createdAt;
}

export function resolveFloristDocStatus(input: {
    flags: Record<string, unknown>;
    floristSettlementStatus: string;
    linkedExpenseDocType: string | null;
    orderStatus: string;
}): FloristDocStatus {
    if (isFloristDocStatus(input.flags.floristDocStatus)) {
        return input.flags.floristDocStatus;
    }
    if (input.orderStatus === 'CANCELLED') return 'CANCELLED';
    if (input.flags.floristMissingDismissedAt) return 'NOT_DUE';

    const docType = (input.linkedExpenseDocType || '').toUpperCase();
    if (docType === 'SCONTRINO' || docType === 'RICEVUTA') return 'RECEIPT_ASSOCIATED';
    if (docType === 'FATTURA') return 'INVOICE_ASSOCIATED';
    if (input.floristSettlementStatus === 'RICEVUTA') return 'INVOICE_ASSOCIATED';

    return 'WAITING_INVOICE';
}
