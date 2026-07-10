import { after } from 'next/server';
import { PaymentStatus } from '@prisma/client';
import { runVeraPostPaymentWorkflow } from '@/lib/vera/orderWorkflow';

type TriggerInput = {
    orderId: string;
    partnerPaymentStatus: string;
};

/**
 * Dopo creazione ordine da dashboard: avvia Punto B (cliente) e Punto A (fiorista se assegnato).
 * Gli ordini `isTest` ricevono messaggi VERA reali; il flag serve solo a separare i dati in dashboard.
 * Usa `after()` così il workflow completa anche su Vercel/serverless dopo la risposta HTTP.
 */
export function scheduleVeraOnDashboardManualOrder(input: TriggerInput): void {
    if (input.partnerPaymentStatus !== PaymentStatus.PAID) {
        console.info('[vera-workflow] Ordine non PAID: skip workflow post-creazione manuale.', {
            orderId: input.orderId,
            partnerPaymentStatus: input.partnerPaymentStatus,
        });
        return;
    }

    after(() => {
        void runVeraPostPaymentWorkflow(input.orderId).catch((error) => {
            console.error('[vera-workflow] Workflow post-creazione ordine manuale fallito:', {
                orderId: input.orderId,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    });
}
