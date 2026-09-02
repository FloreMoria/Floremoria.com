/**
 * Ordini-posa di abbonamenti già saldati all'origine.
 * Perché: le consegne periodiche non sono nuovi corrispettivi — l'incasso esiste
 * solo sul pagamento reale della sottoscrizione (Stripe/PayPal/grossAmount).
 */

export type PrepaidPoseOrderLike = {
    id?: string;
    orderNumber?: string | null;
    isRecurring?: boolean | null;
    stripeTransactionId?: string | null;
    grossAmount?: number | null;
    netAmount?: number | null;
    stripeFee?: number | null;
    paymentMethodLabel?: string | null;
    additionalInstructions?: string | null;
    financeNotes?: string | null;
};

/** True se c'è evidenza di un pagamento gateway / importo catturato. */
export function orderHasRealGatewayPayment(order: PrepaidPoseOrderLike): boolean {
    if (order.stripeTransactionId?.trim()) return true;
    if (order.grossAmount != null && Number.isFinite(order.grossAmount) && order.grossAmount > 0) {
        return true;
    }
    if (order.netAmount != null && Number.isFinite(order.netAmount) && Math.abs(order.netAmount) > 0) {
        return true;
    }
    if (order.stripeFee != null && Number.isFinite(order.stripeFee)) return true;
    if (/stripe|paypal|card|apple|google|klarna/i.test(order.paymentMethodLabel || '')) {
        return true;
    }
    return false;
}

function notesBlob(order: PrepaidPoseOrderLike): string {
    return `${order.additionalInstructions || ''} ${order.financeNotes || ''}`;
}

/** Duplicato operativo da un ordine precedente (catena pose mensili). */
export function orderLooksLikeDuplicatePose(order: PrepaidPoseOrderLike): boolean {
    return /duplicato\s+da\s+[a-z]{2}-[a-z]{2}-\d{2}-\d+/i.test(notesBlob(order));
}

/**
 * Posa di piano prepagato: ricorrenza o duplicato senza cattura gateway.
 * Resta nel passivo fiorista; esclusa da Registro Corrispettivi e ricavi Prima Nota.
 */
export function isPrepaidSubscriptionPoseOrder(order: PrepaidPoseOrderLike): boolean {
    if (orderHasRealGatewayPayment(order)) return false;
    if (order.isRecurring) return true;
    if (orderLooksLikeDuplicatePose(order)) return true;
    return false;
}
