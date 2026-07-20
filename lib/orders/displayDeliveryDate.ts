/**
 * Date mostrate al cliente nel GdM / bacheca: solo consegna (effettiva o prevista),
 * mai la data di inserimento ordine (createdAt).
 */

export type DeliveryDisplayDateInput = {
    status?: string | null;
    deliveryDate?: Date | string | null;
    deliveryProof?: {
        status?: string | null;
        timestampAfter?: Date | string | null;
    } | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Consegna già avvenuta: timestamp prova foto, altrimenti deliveryDate se COMPLETED. */
export function resolveActualDeliveryDate(order: DeliveryDisplayDateInput): Date | null {
    const proofTs = toDate(order.deliveryProof?.timestampAfter ?? null);
    if (proofTs) return proofTs;

    if (order.status === 'COMPLETED' || order.deliveryProof?.status === 'COMPLETED') {
        return toDate(order.deliveryDate ?? null);
    }

    return null;
}

/** Data da mostrare: effettiva se c'è, altrimenti prevista (deliveryDate). */
export function resolveCustomerFacingDeliveryDate(order: DeliveryDisplayDateInput): Date | null {
    return resolveActualDeliveryDate(order) ?? toDate(order.deliveryDate ?? null);
}

export function formatCustomerFacingDeliveryDate(
    order: DeliveryDisplayDateInput,
    options?: Intl.DateTimeFormatOptions
): string | null {
    const date = resolveCustomerFacingDeliveryDate(order);
    if (!date) return null;
    return date.toLocaleDateString(
        'it-IT',
        options ?? { day: 'numeric', month: 'long', year: 'numeric' }
    );
}

export function customerFacingDeliveryDateLabel(order: DeliveryDisplayDateInput): string {
    return resolveActualDeliveryDate(order) ? 'Consegnato il' : 'Consegna prevista';
}
