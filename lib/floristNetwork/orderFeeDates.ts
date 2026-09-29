/**
 * Criteri di data fee rete fioristi (prospetto Art. 9 / Rete&QR).
 *
 * - Fee QR → mese del PAGAMENTO (matura quando l’ordine è pagato)
 * - Compenso esecuzione + coordinamento 10% → mese della CONSEGNA
 */
export function readVeraFlags(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { ...(raw as Record<string, unknown>) };
    }
    return {};
}

/**
 * Istante di pagamento ordine.
 * Priorità: Order.paidAt (webhook Stripe / create pagato) →
 * customerNotifyPaidAt (legacy) → createdAt se PAID.
 */
export function resolveOrderPaymentAt(order: {
    paidAt?: Date | string | null;
    veraWorkflowFlags?: unknown;
    partnerPaymentStatus?: string | null;
    createdAt: Date | string;
}): Date | null {
    if (order.paidAt) {
        const d = order.paidAt instanceof Date ? order.paidAt : new Date(order.paidAt);
        if (!Number.isNaN(d.getTime())) return d;
    }
    const flags = readVeraFlags(order.veraWorkflowFlags);
    const paidRaw = flags.customerNotifyPaidAt;
    if (typeof paidRaw === 'string' && paidRaw.trim()) {
        const d = new Date(paidRaw);
        if (!Number.isNaN(d.getTime())) return d;
    }
    if (order.partnerPaymentStatus === 'PAID') {
        const created =
            order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
        if (!Number.isNaN(created.getTime())) return created;
    }
    return null;
}

/** Data consegna per bucket prospetto (compenso / coordinamento). */
export function resolveOrderDeliveryAt(order: {
    deliveryDate?: Date | string | null;
}): Date | null {
    if (!order.deliveryDate) return null;
    const d =
        order.deliveryDate instanceof Date
            ? order.deliveryDate
            : new Date(order.deliveryDate);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function isDateInBounds(
    date: Date | null | undefined,
    start: Date,
    end: Date
): boolean {
    if (!date) return false;
    const t = date.getTime();
    return t >= start.getTime() && t < end.getTime();
}

/**
 * Filtro Prisma-safe: esclude solo cause CUSTOMER/FLORIST, **include i null**.
 * Mai usare `cancellationCause: { notIn: [...] }` da solo — in SQL i NULL spariscono.
 */
export function prismaWhereCancellationCauseNotCustomerOrFlorist(): {
    OR: Array<Record<string, unknown>>;
} {
    return {
        OR: [
            { cancellationCause: null },
            { cancellationCause: { notIn: ['CUSTOMER', 'FLORIST'] } },
        ],
    };
}
