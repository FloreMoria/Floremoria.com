/** Stati ordine che innescano l'invio del link consegna al fiorista (ASSEGNATO / IN CONSEGNA). */
export const FLORIST_DELIVERY_LINK_ORDER_STATUSES = ['IN_PROGRESS', 'DELIVERING'] as const;

export type FloristDeliveryLinkOrderStatus = (typeof FLORIST_DELIVERY_LINK_ORDER_STATUSES)[number];

export function shouldNotifyFloristDeliveryLink(
    previousStatus: string | null | undefined,
    nextStatus: string
): nextStatus is FloristDeliveryLinkOrderStatus {
    if (previousStatus === nextStatus) return false;
    return (FLORIST_DELIVERY_LINK_ORDER_STATUSES as readonly string[]).includes(nextStatus);
}

/** Nuovo fiorista assegnato (o sostituito) — invia link mini-app con codice ordine. */
export function shouldNotifyFloristOnPartnerAssignment(
    previousPartnerId: string | null | undefined,
    nextPartnerId: string | null | undefined
): boolean {
    const next = nextPartnerId?.trim();
    if (!next) return false;
    return previousPartnerId?.trim() !== next;
}

/** Assegnazione fiorista o passaggio a IN_PROGRESS / DELIVERING. */
export function shouldNotifyFloristDeliveryLinkOnOrderUpdate(
    previous: { status?: string | null; partnerId?: string | null },
    next: { status?: string | null; partnerId?: string | null }
): boolean {
    const nextStatus = next.status ?? previous.status;
    if (nextStatus && shouldNotifyFloristDeliveryLink(previous.status, nextStatus)) {
        return true;
    }
    if (next.partnerId !== undefined) {
        return shouldNotifyFloristOnPartnerAssignment(previous.partnerId, next.partnerId);
    }
    return false;
}
