import {
    runVeraPostPaymentWorkflowWithResults,
    type VeraPostPaymentResult,
} from '@/lib/vera/orderWorkflow';
import { autoAssignKnownTombOrder } from '@/lib/deceased/autoAssignKnownTombOrder';
import prisma from '@/lib/prisma';
import { OrderStatus, PaymentStatus } from '@prisma/client';

export type DashboardManualOrderVeraResult =
    | { skipped: string }
    | VeraPostPaymentResult;

/**
 * Dopo creazione ordine manuale:
 * 1) prova auto-assegnazione tomba nota → IN_PROGRESS + notifiche;
 * 2) se PAID ma ancora ACCEPTED/PENDING, promuove a IN_PROGRESS (presa in carico cliente);
 * 3) se IN_PROGRESS, invia Punto B (cliente) + Punto A (fiorista se assegnato).
 */
export async function runVeraAfterDashboardManualOrder(input: {
    orderId: string;
    partnerPaymentStatus?: string;
    isTest?: boolean;
}): Promise<DashboardManualOrderVeraResult> {
    try {
        const assign = await autoAssignKnownTombOrder(input.orderId).catch((err) => {
            console.error('[vera-workflow] autoAssignKnownTombOrder fallita:', err);
            return { assigned: false as const, reason: 'auto_assign_error' };
        });

        let order = await prisma.order.findFirst({
            where: { id: input.orderId, deletedAt: null },
            select: {
                id: true,
                status: true,
                partnerId: true,
                partnerPaymentStatus: true,
                customerPhone: true,
                orderNumber: true,
            },
        });

        if (!order) {
            return { skipped: 'order_not_found' };
        }

        const paymentConfirmed =
            order.partnerPaymentStatus === PaymentStatus.PAID ||
            input.partnerPaymentStatus === PaymentStatus.PAID ||
            input.partnerPaymentStatus === 'PAID';

        // Promozione a IN_PROGRESS: pagamento dashboard confermato ma stato ancora "ricevuto".
        if (
            paymentConfirmed &&
            (order.status === OrderStatus.ACCEPTED || order.status === OrderStatus.PENDING)
        ) {
            order = await prisma.order.update({
                where: { id: order.id },
                data: { status: OrderStatus.IN_PROGRESS },
                select: {
                    id: true,
                    status: true,
                    partnerId: true,
                    partnerPaymentStatus: true,
                    customerPhone: true,
                    orderNumber: true,
                },
            });
            console.info(
                `[vera-workflow] Ordine manuale ${order.orderNumber || order.id}: ACCEPTED/PENDING+PAID → IN_PROGRESS (sblocca Punto B/A)`
            );
        }

        if (order.status !== OrderStatus.IN_PROGRESS) {
            console.info(
                `[vera-workflow] Ordine ${input.orderId} non in IN_PROGRESS (stato=${order.status}): Punto A/B in attesa`
            );
            return { skipped: 'waiting_in_progress' };
        }

        if (!order.customerPhone?.trim()) {
            console.warn(
                `[vera-workflow] Ordine ${order.orderNumber || order.id}: telefono cliente assente — Punto B non inviabile`
            );
        }

        // Se auto-assign ha già sparato onOrderStatusChanged, i dedup rendono idempotente il re-run.
        if (assign.assigned && 'becameInProgress' in assign && assign.becameInProgress) {
            return runVeraPostPaymentWorkflowWithResults(input.orderId);
        }

        return await runVeraPostPaymentWorkflowWithResults(input.orderId);
    } catch (error) {
        console.error('[vera-workflow] Workflow post-creazione ordine manuale fallito:', {
            orderId: input.orderId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
