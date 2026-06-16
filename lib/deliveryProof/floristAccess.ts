import type { Order, OrderStatus } from '@prisma/client';

const ACTIVE_STATUSES: OrderStatus[] = ['ACCEPTED', 'IN_PROGRESS', 'DELIVERING'];
const POST_COMPLETION_WINDOW_MS = 48 * 60 * 60 * 1000;

export type FloristAccessResult =
    | { allowed: true; reason: 'in_progress' | 'recently_completed' }
    | { allowed: false; reason: 'not_found' | 'cancelled' | 'expired' | 'pending_unpaid' };

/**
 * Link mini-app persistente finché l'ordine è in corso o completato da meno di 48h.
 */
export function evaluateFloristDeliveryAccess(
    order: Pick<Order, 'status' | 'updatedAt' | 'deletedAt' | 'partnerPaymentStatus'> | null
): FloristAccessResult {
    if (!order || order.deletedAt) {
        return { allowed: false, reason: 'not_found' };
    }
    if (order.status === 'CANCELLED') {
        return { allowed: false, reason: 'cancelled' };
    }
    if (order.status === 'PENDING' && order.partnerPaymentStatus === 'UNPAID') {
        return { allowed: false, reason: 'pending_unpaid' };
    }
    if (ACTIVE_STATUSES.includes(order.status)) {
        return { allowed: true, reason: 'in_progress' };
    }
    if (order.status === 'COMPLETED') {
        const elapsed = Date.now() - order.updatedAt.getTime();
        if (elapsed <= POST_COMPLETION_WINDOW_MS) {
            return { allowed: true, reason: 'recently_completed' };
        }
        return { allowed: false, reason: 'expired' };
    }
    if (order.status === 'PENDING') {
        return { allowed: true, reason: 'in_progress' };
    }
    return { allowed: false, reason: 'expired' };
}
