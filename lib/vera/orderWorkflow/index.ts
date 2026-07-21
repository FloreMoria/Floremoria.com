/**
 * Orchestratore post-pagamento / post-creazione ordine manuale.
 * - Punto A (fiorista) e Punto B (cliente) NON partono al pagamento:
 *   solo al passaggio a IN_PROGRESS via orderStatusFilter (fascia 8:30–19:30 per A).
 */
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
    customer: { ok: boolean; skipped?: string };
    florist: { ok: boolean; skipped?: string };
};

/**
 * Post-pagamento: nessun WhatsApp immediato.
 * Cascata fiorista + conferma cliente partono su IN_PROGRESS.
 */
export async function runVeraPostPaymentWorkflowWithResults(
    _orderId: string
): Promise<VeraPostPaymentResult> {
    return {
        customer: {
            ok: true,
            skipped: 'puntoB_deferred_until_IN_PROGRESS',
        },
        florist: {
            ok: true,
            skipped: 'puntoA_deferred_until_IN_PROGRESS',
        },
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
    const prisma = (await import('@/lib/prisma')).default;

    const order = await prisma.order.findFirst({
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
