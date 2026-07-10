import { PaymentStatus } from '@prisma/client';
import {
    runVeraPostPaymentWorkflowWithResults,
    type VeraPostPaymentResult,
} from '@/lib/vera/orderWorkflow';

export type DashboardManualOrderVeraResult =
    | { skipped: string }
    | VeraPostPaymentResult;

/**
 * Esegue VERA subito dopo creazione ordine manuale (await — affidabile su Vercel).
 * `isTest` non blocca l'invio: serve solo a separare i dati in dashboard.
 */
export async function runVeraAfterDashboardManualOrder(input: {
    orderId: string;
    partnerPaymentStatus: string;
}): Promise<DashboardManualOrderVeraResult> {
    if (input.partnerPaymentStatus !== PaymentStatus.PAID) {
        return { skipped: 'not_paid' };
    }

    try {
        return await runVeraPostPaymentWorkflowWithResults(input.orderId);
    } catch (error) {
        console.error('[vera-workflow] Workflow post-creazione ordine manuale fallito:', {
            orderId: input.orderId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
