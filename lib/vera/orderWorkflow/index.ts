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

/**
 * Orchestratore post-pagamento: B (utente) poi A (fiorista se assegnato).
 */
export async function runVeraPostPaymentWorkflow(orderId: string): Promise<void> {
    await runVeraPostPaymentWorkflowWithResults(orderId);
}

export type VeraPostPaymentResult = {
    customer: Awaited<ReturnType<typeof runPuntoBCustomerOrderConfirm>>;
    florist?: Awaited<ReturnType<typeof runPuntoAFloristNewOrder>>;
};

/** Come runVeraPostPaymentWorkflow ma restituisce esito per debug dashboard/test. */
export async function runVeraPostPaymentWorkflowWithResults(
    orderId: string
): Promise<VeraPostPaymentResult> {
    const customer = await runPuntoBCustomerOrderConfirm(orderId);

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { partnerId: true },
    });

    let florist: VeraPostPaymentResult['florist'];
    if (order?.partnerId) {
        florist = await runPuntoAFloristNewOrder(orderId);
    }

    return { customer, florist };
}

/**
 * Re-trigger Punto A quando operatore completa gravePosition in dashboard.
 */
export async function retryPuntoAIfBlocked(orderId: string): Promise<void> {
    await runPuntoAFloristNewOrder(orderId).catch((e) => {
        console.error('[vera-workflow] Retry Punto A fallito:', e);
    });
}
