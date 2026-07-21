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

export {
    runPuntoAFloristNewOrder,
    runPuntoBCustomerOrderConfirm,
    runPuntoEFDeliveryComplete,
    runPuntoGOrderReminders,
    tryRunPuntoHReviewRequest,
    flushPendingPuntoAFloristNotifications,
};

export * from '@/lib/vera/orderWorkflow/exceptionScenarios';
export * from '@/lib/vera/orderWorkflow/types';

export async function runVeraPostPaymentWorkflow(orderId: string): Promise<void> {
    await runVeraPostPaymentWorkflowWithResults(orderId);
}

export type VeraPostPaymentResult = {
    customer: { ok: boolean; skipped?: string; error?: string };
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
        },
        florist,
    };
}

/**
 * Re-trigger Punto A dopo inserimento posizione tomba / sblocco alert.
 * Force + bypass fascia: l'operatore ha appena agito in dashboard.
 */
export async function retryPuntoAIfBlocked(orderId: string): Promise<void> {
    const { clearVeraOperationalAlert } = await import('@/lib/vera/operationalAlerts');
    const { releaseWorkflowStep } = await import('@/lib/vera/orderWorkflow/claimWorkflowStep');
    const { wasOrderTemplateSent } = await import('@/lib/vera/orderWorkflow/orderOutboundDedup');
    const prismaClient = (await import('@/lib/prisma')).default;

    const order = await prismaClient.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { id: true, orderNumber: true, veraWorkflowFlags: true, veraAlertType: true },
    });
    if (!order) return;

    // Se il claim c'è ma nessun template in chat → orfano: rilascia.
    const anySent = await wasOrderTemplateSent(order.id, 'florist_first_001', order.orderNumber);
    if (!anySent) {
        await releaseWorkflowStep(order.id, 'puntoA_florist').catch(() => undefined);
    }

    if (order.veraAlertType === 'grave_position_missing' || order.veraAlertType === 'punto_a_send_failed') {
        await clearVeraOperationalAlert(order.id).catch(() => undefined);
    }

    await notifyFloristDeliveryLinkForOrder(orderId, {
        force: !anySent,
        bypassWindow: true,
    }).catch((e) => {
        console.error('[vera-workflow] Retry Punto A fallito:', e);
    });
}
