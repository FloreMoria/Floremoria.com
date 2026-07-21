/** Stati ordine che innescano la cascata WhatsApp fiorista (Punto A). */
export const FLORIST_DELIVERY_LINK_ORDER_STATUSES = ['IN_PROGRESS'] as const;

export type FloristDeliveryLinkOrderStatus = (typeof FLORIST_DELIVERY_LINK_ORDER_STATUSES)[number];

/**
 * True solo al passaggio *verso* IN_PROGRESS ("In Lavorazione").
 * Perché: i 4 template partono a presa in carico operativa, non all'assegnazione né al pagamento.
 */
export function shouldNotifyFloristDeliveryLink(
    previousStatus: string | null | undefined,
    nextStatus: string
): nextStatus is FloristDeliveryLinkOrderStatus {
    if (previousStatus === nextStatus) return false;
    return (FLORIST_DELIVERY_LINK_ORDER_STATUSES as readonly string[]).includes(nextStatus);
}

/** @deprecated Assegnazione fiorista non invia più WhatsApp: resta solo IN_PROGRESS. */
export function shouldNotifyFloristOnPartnerAssignment(
    _previousPartnerId: string | null | undefined,
    _nextPartnerId: string | null | undefined
): boolean {
    return false;
}

/** Aggiornamento ordine: notifica fiorista solo se lo stato diventa IN_PROGRESS. */
export function shouldNotifyFloristDeliveryLinkOnOrderUpdate(
    previous: { status?: string | null; partnerId?: string | null },
    next: { status?: string | null; partnerId?: string | null }
): boolean {
    const nextStatus = next.status ?? previous.status;
    if (!nextStatus) return false;
    return shouldNotifyFloristDeliveryLink(previous.status, nextStatus);
}
