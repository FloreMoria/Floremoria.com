import prisma from '@/lib/prisma';
import { runPuntoAFloristNewOrder } from '@/lib/vera/orderWorkflow/puntoAFloristNewOrder';

export interface FloristDeliveryNotifyResult {
    ok: boolean;
    skipped?: string;
    blocked?: boolean;
    isFirstOrder?: boolean;
    channel?: 'vera_meta_template';
    error?: string;
}

/**
 * Notifica fiorista nuovo ordine — workflow nativo VERA (Punto A).
 * Sostituisce integrazioni esterne legacy / testo libero.
 */
export async function notifyFloristDeliveryLinkForOrder(
    orderId: string
): Promise<FloristDeliveryNotifyResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { id: true, partnerId: true, partner: { select: { deletedAt: true } } },
    });

    if (!order) return { ok: false, skipped: 'order_not_found' };
    if (!order.partnerId || order.partner?.deletedAt) {
        return { ok: false, skipped: 'no_partner_assigned' };
    }

    const result = await runPuntoAFloristNewOrder(orderId);
    if (result.blocked) {
        return {
            ok: false,
            blocked: true,
            isFirstOrder: result.isFirstOrder,
            skipped: result.error,
        };
    }
    if (!result.ok) {
        return { ok: false, error: result.error, skipped: result.skipped };
    }

    return { ok: true, isFirstOrder: result.isFirstOrder, channel: 'vera_meta_template' };
}
