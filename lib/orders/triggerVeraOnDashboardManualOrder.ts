import {
    runPuntoBCustomerOrderConfirm,
    type VeraPostPaymentResult,
} from '@/lib/vera/orderWorkflow';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { autoAssignKnownTombOrder } from '@/lib/deceased/autoAssignKnownTombOrder';
import prisma from '@/lib/prisma';
import { OrderStatus, PaymentStatus } from '@prisma/client';

export type DashboardManualOrderVeraResult =
    | { skipped: string }
    | VeraPostPaymentResult;

/**
 * Dopo creazione ordine manuale:
 * 1) auto-assegnazione tomba nota se possibile;
 * 2) PAID + ACCEPTED/PENDING → IN_PROGRESS;
 * 3) Punto B cliente **immediato** (bypass +30 min: la presa in carico dashboard non può dipendere dal wake Hobby);
 * 4) Punto A fiorista se assegnato.
 */
export async function runVeraAfterDashboardManualOrder(input: {
    orderId: string;
    partnerPaymentStatus?: string;
    isTest?: boolean;
}): Promise<DashboardManualOrderVeraResult> {
    try {
        await autoAssignKnownTombOrder(input.orderId).catch((err) => {
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
                `[vera-workflow] Ordine manuale ${order.orderNumber || order.id}: ACCEPTED/PENDING+PAID → IN_PROGRESS`
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

        // Dashboard manuale = presa in carico già confermata dallo staff → niente delay +30 min.
        const customerResult = await runPuntoBCustomerOrderConfirm(order.id, {
            bypassSchedule: true,
        }).catch((err) => {
            console.error('[vera-workflow] Punto B (manuale) fallito:', err);
            return {
                ok: false as const,
                error: err instanceof Error ? err.message : String(err),
            };
        });

        let florist: VeraPostPaymentResult['florist'];
        if (!order.partnerId) {
            florist = { ok: true, skipped: 'no_partner_assigned' };
        } else {
            const notify = await notifyFloristDeliveryLinkForOrder(order.id).catch((err) => {
                console.error('[vera-workflow] Punto A (manuale) fallito:', err);
                return {
                    ok: false as const,
                    error: err instanceof Error ? err.message : String(err),
                };
            });
            florist = {
                ok: notify.ok,
                skipped: 'skipped' in notify ? notify.skipped : undefined,
                blocked: 'blocked' in notify ? notify.blocked : undefined,
                error: 'error' in notify ? notify.error : undefined,
                deferred: 'deferred' in notify ? notify.deferred : undefined,
            };
        }

        return {
            customer: {
                ok: customerResult.ok,
                skipped: 'skipped' in customerResult ? customerResult.skipped : undefined,
                error: 'error' in customerResult ? customerResult.error : undefined,
                deferred: 'deferred' in customerResult ? customerResult.deferred : undefined,
                scheduledFor:
                    'scheduledFor' in customerResult ? customerResult.scheduledFor : undefined,
            },
            florist,
        };
    } catch (error) {
        console.error('[vera-workflow] Workflow post-creazione ordine manuale fallito:', {
            orderId: input.orderId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
