import prisma from '@/lib/prisma';
import { computeCustomerConfirmSendAt } from '@/lib/datetime/customerConfirmSchedule';
import { resolveOrderBuyerEmail } from '@/lib/orders/resolveOrderBuyerContact';
import { enqueuePuntoBWake } from '@/lib/vera/orderWorkflow/schedulePuntoBWake';
import {
    isWorkflowStepDone,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';

export type SchedulePostPaymentCustomerNotifyResult = {
    scheduled: boolean;
    sendAt?: string;
    skipped?: string;
};

/**
 * Schedula WhatsApp Punto B + email cliente a +60s dal pagamento confermato.
 * Perché: il webhook Stripe non può attendere; la catena wake rispetta il delay su Hobby.
 */
export async function schedulePostPaymentCustomerNotifications(
    orderId: string,
    paidAt: Date = new Date()
): Promise<SchedulePostPaymentCustomerNotifyResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { user: { select: { email: true, name: true } } },
    });

    if (!order) {
        return { scheduled: false, skipped: 'order_not_found' };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (isWorkflowStepDone(flags, 'puntoB_customer') && flags.customer_email_sent) {
        console.info('[customer-notify] skip schedule: conferme già inviate', {
            orderId: order.id,
            orderNumber: order.orderNumber,
        });
        return { scheduled: false, skipped: 'already_sent' };
    }

    const sendAt = computeCustomerConfirmSendAt({
        paidAt,
        createdAt: order.createdAt,
        isTest: order.isTest,
    });

    if (flags.customerNotifyPaidAt && flags.puntoB_customer_scheduled) {
        const existingSendAt = new Date(flags.puntoB_customer_scheduled);
        if (!Number.isNaN(existingSendAt.getTime())) {
            console.info('[customer-notify] ri-arm wake esistente', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                sendAt: existingSendAt.toISOString(),
            });
            enqueuePuntoBWake({ orderId: order.id, sendAt: existingSendAt });
            return { scheduled: true, sendAt: existingSendAt.toISOString(), skipped: 'already_scheduled' };
        }
    }

    const updatedFlags = {
        ...flags,
        customerNotifyPaidAt: paidAt.toISOString(),
        customerEmailScheduledAt: sendAt.toISOString(),
        puntoB_customer_scheduled: sendAt.toISOString(),
    };

    await prisma.order.update({
        where: { id: orderId },
        data: { veraWorkflowFlags: updatedFlags },
    });

    console.info('[customer-notify] schedulato post-pagamento', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paidAt: paidAt.toISOString(),
        sendAt: sendAt.toISOString(),
        delayMs: sendAt.getTime() - paidAt.getTime(),
        buyerEmail: resolveOrderBuyerEmail(order),
        hasPhone: Boolean(order.customerPhone?.trim()),
        isRecurring: order.isRecurring,
    });

    enqueuePuntoBWake({ orderId: order.id, sendAt });
    return { scheduled: true, sendAt: sendAt.toISOString() };
}
