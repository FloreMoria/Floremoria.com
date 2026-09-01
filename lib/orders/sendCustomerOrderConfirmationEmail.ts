import prisma from '@/lib/prisma';
import { isCustomerConfirmSendDue } from '@/lib/datetime/customerConfirmSchedule';
import { buildOrderCustomerHtml } from '@/lib/orderEmails';
import { resolveOrderBuyerEmail } from '@/lib/orders/resolveOrderBuyerContact';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import { parseWorkflowFlags } from '@/lib/vera/orderWorkflow/types';

export type CustomerOrderEmailResult = {
    ok: boolean;
    skipped?: string;
    error?: string;
};

/**
 * Email ricevuta/conferma ordine al cliente, con dedup su veraWorkflowFlags.customer_email_sent.
 */
export async function sendScheduledCustomerOrderEmail(orderId: string): Promise<CustomerOrderEmailResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            items: { include: { product: true } },
            user: { select: { email: true } },
        },
    });

    if (!order) {
        return { ok: false, skipped: 'order_not_found' };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (flags.customer_email_sent) {
        return { ok: true, skipped: 'already_sent' };
    }

    const scheduledRaw = flags.customerEmailScheduledAt || flags.customerNotifyPaidAt;
    if (scheduledRaw) {
        const paidAt = flags.customerNotifyPaidAt
            ? new Date(flags.customerNotifyPaidAt)
            : null;
        const sendAt = flags.customerEmailScheduledAt
            ? new Date(flags.customerEmailScheduledAt)
            : paidAt
              ? new Date(paidAt.getTime() + 60_000)
              : null;
        if (sendAt && !isCustomerConfirmSendDue(sendAt)) {
            return { ok: true, skipped: 'not_due_yet' };
        }
    }

    const buyer = resolveOrderBuyerEmail(order);
    if (!buyer) {
        console.info('[customer-notify] email cliente saltata: nessuna email valida', {
            orderId: order.id,
            orderNumber: order.orderNumber,
        });
        return { ok: true, skipped: 'no_buyer_email' };
    }

    try {
        const customerBcc = process.env.FLOREM_CUSTOMER_RECEIPT_BCC?.trim();
        const html = buildOrderCustomerHtml({ order });
        const result = await sendFloremTransactionalMail({
            to: buyer,
            ...(customerBcc ? { bcc: customerBcc } : {}),
            replyTo: process.env.FLOREM_MAIL_REPLY_TO?.trim() || 'assistenza@floremoria.com',
            subject: `Conferma ordine ${order.orderNumber || ''} — FloreMoria`.trim(),
            html,
        });

        if (result.ok) {
            await prisma.order.update({
                where: { id: orderId },
                data: {
                    veraWorkflowFlags: {
                        ...flags,
                        customer_email_sent: new Date().toISOString(),
                    },
                },
            });
            console.info('[customer-notify] email cliente inviata', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                to: buyer,
            });
        } else {
            console.error('[customer-notify] email cliente fallita', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                to: buyer,
                error: result.error,
            });
        }

        return { ok: result.ok, error: result.error };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[customer-notify] email cliente eccezione', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            error: message,
        });
        return { ok: false, error: message };
    }
}
