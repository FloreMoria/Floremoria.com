import prisma from '@/lib/prisma';
import { runPuntoBCustomerOrderConfirm, type PuntoBResult } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import { runPuntoAFloristNewOrder, type PuntoAResult } from '@/lib/vera/orderWorkflow/puntoAFloristNewOrder';

export interface ResendVeraOrderNotificationsResult {
    ok: boolean;
    orderNumber: string;
    orderId?: string;
    customer?: PuntoBResult;
    florist?: PuntoAResult;
    error?: string;
}

export async function resendVeraOrderNotifications(
    orderNumber: string,
    options: { customer?: boolean; florist?: boolean; force?: boolean } = {}
): Promise<ResendVeraOrderNotificationsResult> {
    const normalized = orderNumber.trim();
    const sendCustomer = options.customer !== false;
    const sendFlorist = options.florist !== false;
    const force = options.force === true;

    const order = await prisma.order.findFirst({
        where: { orderNumber: normalized, deletedAt: null },
        select: { id: true, orderNumber: true, partnerId: true },
    });

    if (!order) {
        return { ok: false, orderNumber: normalized, error: 'Ordine non trovato' };
    }

    const result: ResendVeraOrderNotificationsResult = {
        ok: true,
        orderNumber: normalized,
        orderId: order.id,
    };

    if (sendCustomer) {
        result.customer = await runPuntoBCustomerOrderConfirm(order.id, { force });
        if (!result.customer.ok && !result.customer.skipped) {
            result.ok = false;
        }
    }

    if (sendFlorist && order.partnerId) {
        result.florist = await runPuntoAFloristNewOrder(order.id, { force });
        if (!result.florist.ok && !result.florist.skipped && !result.florist.blocked) {
            result.ok = false;
        }
    }

    return result;
}
