import {
    runVeraPostPaymentWorkflowWithResults,
    type VeraPostPaymentResult,
} from '@/lib/vera/orderWorkflow';

export type DashboardManualOrderVeraResult =
    | { skipped: string }
    | VeraPostPaymentResult;

/**
 * Esegue VERA subito dopo creazione ordine manuale (await — affidabile su Vercel).
 * Nessun vincolo su partnerPaymentStatus: in Dashboard il pagamento cliente è già confermato.
 * `isTest` non blocca l'invio: in sandbox la fascia oraria fioristi è bypassata a valle.
 */
export async function runVeraAfterDashboardManualOrder(input: {
    orderId: string;
    partnerPaymentStatus?: string;
    isTest?: boolean;
}): Promise<DashboardManualOrderVeraResult> {
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
