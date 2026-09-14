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
    totalPriceCents?: number | null;
    deliveryDate?: Date | string | null;
    status?: string | null;
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

/**
 * Ordine padre di carnet/abbonamento: porta l'incasso cliente, non è una consegna.
 * Non entra nel registro passivo fiorista (il debito nasce sulle pose).
 */
export function isPrepaidCarnetParentOrder(order: PrepaidPoseOrderLike): boolean {
    if (isPrepaidSubscriptionPoseOrder(order)) return false;
    const hasOwnSale =
        orderHasRealGatewayPayment(order) ||
        (order.totalPriceCents != null && order.totalPriceCents > 0);
    if (!hasOwnSale) return false;
    const blob = notesBlob(order);
    // Marker espliciti (es. FT-MC-26-007: CARNET_PREPAGATO / registrazione carnet)
    if (/CARNET_PREPAGATO|registrazione\s+carnet|ordine\s+padre\s+carnet/i.test(blob)) {
        return true;
    }
    return false;
}
