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
 * Re-trigger Punto A quando operatore completa gravePosition in dashboard
 * (rispetta fascia oraria 8:30–19:30 salvo force).
 */
export async function retryPuntoAIfBlocked(orderId: string): Promise<void> {
    await notifyFloristDeliveryLinkForOrder(orderId).catch((e) => {
        console.error('[vera-workflow] Retry Punto A fallito:', e);
    });
}
