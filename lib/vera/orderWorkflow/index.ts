/**
 * Orchestratore post-pagamento / post-creazione ordine manuale.
 * - Punto A (fiorista) se assegnato.
 * - Punto B (conferma presa in carico al cliente) NON parte qui:
 *   solo al passaggio di stato IN_PROGRESS via orderStatusFilter.
 */
import prisma from '@/lib/prisma';
import { runPuntoAFloristNewOrder } from '@/lib/vera/orderWorkflow/puntoAFloristNewOrder';
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import { runPuntoEFDeliveryComplete } from '@/lib/vera/orderWorkflow/puntoEFDeliveryComplete';
import { runPuntoGOrderReminders } from '@/lib/vera/orderWorkflow/puntoGReminders';
import { tryRunPuntoHReviewRequest } from '@/lib/vera/orderWorkflow/puntoHReview';

export {
    runPuntoAFloristNewOrder,
    runPuntoBCustomerOrderConfirm,
    runPuntoEFDeliveryComplete,
    runPuntoGOrderReminders,
    tryRunPuntoHReviewRequest,
};

export * from '@/lib/vera/orderWorkflow/exceptionScenarios';
export * from '@/lib/vera/orderWorkflow/types';

export async function runVeraPostPaymentWorkflow(orderId: string): Promise<void> {
    await runVeraPostPaymentWorkflowWithResults(orderId);
}

export type VeraPostPaymentResult = {
    /** Sempre skipped qui: Punto B è solo su IN_PROGRESS. */
    customer: { ok: boolean; skipped?: string };
    florist?: Awaited<ReturnType<typeof runPuntoAFloristNewOrder>>;
};

/** Post-pagamento: solo notifica fiorista (Punto A). Il cliente aspetta IN_PROGRESS. */
export async function runVeraPostPaymentWorkflowWithResults(
    orderId: string
): Promise<VeraPostPaymentResult> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { partnerId: true, status: true },
    });

    let florist: VeraPostPaymentResult['florist'];
    if (order?.partnerId) {
        florist = await runPuntoAFloristNewOrder(orderId);
    }

    return {
        customer: {
            ok: true,
            skipped: 'puntoB_deferred_until_IN_PROGRESS',
        },
        florist,
    };
}

/**
 * Re-trigger Punto A quando operatore completa gravePosition in dashboard.
 */
export async function retryPuntoAIfBlocked(orderId: string): Promise<void> {
    await runPuntoAFloristNewOrder(orderId).catch((e) => {
        console.error('[vera-workflow] Retry Punto A fallito:', e);
    });
}
