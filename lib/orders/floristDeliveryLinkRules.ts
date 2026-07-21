/** Stati ordine che possono innescare la cascata WhatsApp fiorista (Punto A). */
export const FLORIST_DELIVERY_LINK_ORDER_STATUSES = [
    'PENDING',
    'ACCEPTED',
    'IN_PROGRESS',
] as const;

export type FloristDeliveryLinkOrderStatus = (typeof FLORIST_DELIVERY_LINK_ORDER_STATUSES)[number];

/**
 * True al passaggio verso uno stato operativo con fiorista già in carico.
 * Perché: in Dashboard l'ordine è già pagato; le notifiche partono da creazione/assegnazione.
 */
export function shouldNotifyFloristDeliveryLink(
    previousStatus: string | null | undefined,
    nextStatus: string
): nextStatus is FloristDeliveryLinkOrderStatus {
    if (previousStatus === nextStatus) return false;
    return (FLORIST_DELIVERY_LINK_ORDER_STATUSES as readonly string[]).includes(nextStatus);
}

/**
 * True quando viene assegnato (o cambiato) un fiorista.
 * Perché: l'assegnazione deve scatenare subito Punto A (con fascia oraria in Produzione).
 */
export function shouldNotifyFloristOnPartnerAssignment(
    previousPartnerId: string | null | undefined,
    nextPartnerId: string | null | undefined
): boolean {
    if (!nextPartnerId) return false;
    return previousPartnerId !== nextPartnerId;
}

/** Aggiornamento ordine: notifica fiorista su cambio stato operativo o nuova assegnazione. */
export function shouldNotifyFloristDeliveryLinkOnOrderUpdate(
    previous: { status?: string | null; partnerId?: string | null },
    next: { status?: string | null; partnerId?: string | null }
): boolean {
    const nextStatus = next.status ?? previous.status;
    const nextPartnerId = next.partnerId !== undefined ? next.partnerId : previous.partnerId;

    if (shouldNotifyFloristOnPartnerAssignment(previous.partnerId, nextPartnerId)) {
        return true;
    }
    if (!nextStatus) return false;
    return shouldNotifyFloristDeliveryLink(previous.status, nextStatus);
}
