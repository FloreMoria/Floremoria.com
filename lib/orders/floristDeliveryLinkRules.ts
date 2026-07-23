/** Stati ordine che possono innescare la cascata WhatsApp fiorista (Punto A). */
export const FLORIST_DELIVERY_LINK_ORDER_STATUSES = ['IN_PROGRESS'] as const;

export type FloristDeliveryLinkOrderStatus = (typeof FLORIST_DELIVERY_LINK_ORDER_STATUSES)[number];

/**
 * True al passaggio verso In Lavorazione (unico stato che sblocca Punto A/B).
 */
export function shouldNotifyFloristDeliveryLink(
    previousStatus: string | null | undefined,
    nextStatus: string
): nextStatus is FloristDeliveryLinkOrderStatus {
    if (previousStatus === nextStatus) return false;
    return nextStatus === 'IN_PROGRESS';
}

/**
 * True quando viene assegnato (o cambiato) un fiorista.
 * La notifica WhatsApp parte solo se lo stato è già IN_PROGRESS (vedi onOrderUpdate).
 */
export function shouldNotifyFloristOnPartnerAssignment(
    previousPartnerId: string | null | undefined,
    nextPartnerId: string | null | undefined
): boolean {
    if (!nextPartnerId) return false;
    return previousPartnerId !== nextPartnerId;
}

/** Aggiornamento ordine: notifica fiorista solo in In Lavorazione (o nuova assegnazione già in lavorazione). */
export function shouldNotifyFloristDeliveryLinkOnOrderUpdate(
    previous: { status?: string | null; partnerId?: string | null },
    next: { status?: string | null; partnerId?: string | null }
): boolean {
    const nextStatus = next.status ?? previous.status;
    const nextPartnerId = next.partnerId !== undefined ? next.partnerId : previous.partnerId;

    if (nextStatus !== 'IN_PROGRESS') return false;

    if (shouldNotifyFloristOnPartnerAssignment(previous.partnerId, nextPartnerId)) {
        return true;
    }
    if (!nextStatus) return false;
    return shouldNotifyFloristDeliveryLink(previous.status, nextStatus);
}
