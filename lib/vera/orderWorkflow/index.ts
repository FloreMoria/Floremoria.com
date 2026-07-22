/**
 * Orchestratore post-creazione / post-pagamento ordine.
 * - Nessun vincolo su partnerPaymentStatus: in Dashboard (e dopo Stripe) il pagamento è confermato.
 * - Punto A (fiorista): subito se c'è partner; fuori fascia 08:00–20:00 differito (sandbox bypass).
 * - Punto B (cliente): subito alla creazione/pagamento.
 */
import prisma from '@/lib/prisma';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { runPuntoAFloristNewOrder } from '@/lib/vera/orderWorkflow/puntoAFloristNewOrder';
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import { runPuntoEFDeliveryComplete } from '@/lib/vera/orderWorkflow/puntoEFDeliveryComplete';
import { runPuntoGOrderReminders } from '@/lib/vera/orderWorkflow/puntoGReminders';
import { tryRunPuntoHReviewRequest } from '@/lib/vera/orderWorkflow/puntoHReview';
import { flushPendingPuntoAFloristNotifications } from '@/lib/vera/orderWorkflow/flushPendingPuntoA';
import { flushPendingPuntoBCustomerConfirm } from '@/lib/vera/orderWorkflow/flushPendingPuntoB';

export {
    runPuntoAFloristNewOrder,
    runPuntoBCustomerOrderConfirm,
    runPuntoEFDeliveryComplete,
    runPuntoGOrderReminders,
    tryRunPuntoHReviewRequest,
    flushPendingPuntoAFloristNotifications,
    flushPendingPuntoBCustomerConfirm,
};

export * from '@/lib/vera/orderWorkflow/exceptionScenarios';
export * from '@/lib/vera/orderWorkflow/types';

export async function runVeraPostPaymentWorkflow(orderId: string): Promise<void> {
    await runVeraPostPaymentWorkflowWithResults(orderId);
}

export type VeraPostPaymentResult = {
    customer: {
        ok: boolean;
        skipped?: string;
        error?: string;
        deferred?: boolean;
        scheduledFor?: string;
    };
    florist: {
        ok: boolean;
        skipped?: string;
        blocked?: boolean;
        error?: string;
        deferred?: boolean;
    };
};

/**
 * Post-creazione / post-pagamento: invia subito Punto B e, se c'è fiorista, Punto A.
 */
export async function runVeraPostPaymentWorkflowWithResults(
    orderId: string
): Promise<VeraPostPaymentResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { id: true, partnerId: true },
    });

    if (!order) {
        return {
            customer: { ok: false, skipped: 'order_not_found' },
            florist: { ok: false, skipped: 'order_not_found' },
        };
    }

    const customerResult = await runPuntoBCustomerOrderConfirm(orderId).catch((err) => {
        console.error('[vera-workflow] Punto B fallito:', err);
        return {
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
        } satisfies VeraPostPaymentResult['customer'];
    });

    let florist: VeraPostPaymentResult['florist'];
    if (!order.partnerId) {
        florist = { ok: true, skipped: 'no_partner_assigned' };
    } else {
        const notify = await notifyFloristDeliveryLinkForOrder(orderId).catch((err) => {
            console.error('[vera-workflow] Punto A fallito:', err);
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
            scheduledFor: 'scheduledFor' in customerResult ? customerResult.scheduledFor : undefined,
        },
        florist,
    };
}

/**
 * Re-trigger Punto A solo se non risulta ancora inviato.
 * Perché: force:!anySent + release orfano re-sparava messaggi a ogni edit tomba/alert.
 */
export async function retryPuntoAIfBlocked(orderId: string): Promise<void> {
    const { clearVeraOperationalAlert } = await import('@/lib/vera/operationalAlerts');
    const { wasOrderTemplateSent } = await import('@/lib/vera/orderWorkflow/orderOutboundDedup');
    const { isWorkflowStepDone, parseWorkflowFlags } = await import('@/lib/vera/orderWorkflow/types');
    const prismaClient = (await import('@/lib/prisma')).default;

    const order = await prismaClient.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { id: true, orderNumber: true, veraWorkflowFlags: true, veraAlertType: true },
    });
    if (!order) return;

    if (order.veraAlertType === 'grave_position_missing' || order.veraAlertType === 'punto_a_send_failed') {
        await clearVeraOperationalAlert(order.id).catch(() => undefined);
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    const claimed = isWorkflowStepDone(flags, 'puntoA_florist');
    const anySent = await wasOrderTemplateSent(order.id, 'florist_first_001', order.orderNumber);
    if (claimed || anySent) {
        console.info(
            `[vera-workflow] Retry Punto A non necessario (già inviato/claim) ordine ${order.orderNumber || order.id}`
        );
        return;
    }

    await notifyFloristDeliveryLinkForOrder(orderId, {
        force: false,
        bypassWindow: true,
    }).catch((e) => {
        console.error('[vera-workflow] Retry Punto A fallito:', e);
    });
}
