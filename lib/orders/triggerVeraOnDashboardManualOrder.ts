import {
    runVeraPostPaymentWorkflowWithResults,
    type VeraPostPaymentResult,
} from '@/lib/vera/orderWorkflow';
import { autoAssignKnownTombOrder } from '@/lib/deceased/autoAssignKnownTombOrder';
import prisma from '@/lib/prisma';

export type DashboardManualOrderVeraResult =
    | { skipped: string }
    | VeraPostPaymentResult;

/**
 * Dopo creazione ordine manuale:
 * 1) prova auto-assegnazione tomba nota → IN_PROGRESS + notifiche;
 * 2) se già IN_PROGRESS (scelto in dashboard), invia Punto A/B;
 * 3) altrimenti resta in attesa (niente WhatsApp finché non è In Lavorazione).
 */
export async function runVeraAfterDashboardManualOrder(input: {
    orderId: string;
    partnerPaymentStatus?: string;
    isTest?: boolean;
}): Promise<DashboardManualOrderVeraResult> {
    try {
        const assign = await autoAssignKnownTombOrder(input.orderId).catch((err) => {
            console.error('[vera-workflow] autoAssignKnownTombOrder fallita:', err);
            return { assigned: false as const, reason: 'auto_assign_error' };
        });

        const order = await prisma.order.findFirst({
            where: { id: input.orderId, deletedAt: null },
            select: { id: true, status: true, partnerId: true },
        });

        if (!order) {
            return { skipped: 'order_not_found' };
        }

        if (order.status !== 'IN_PROGRESS') {
            console.info(
                `[vera-workflow] Ordine ${input.orderId} non in IN_PROGRESS (stato=${order.status}): Punto A/B in attesa`
            );
            return { skipped: 'waiting_in_progress' };
        }

        // Se auto-assign ha già sparato onOrderStatusChanged, i dedup rendono idempotente il re-run.
        if (assign.assigned && 'becameInProgress' in assign && assign.becameInProgress) {
            return runVeraPostPaymentWorkflowWithResults(input.orderId);
        }

        return await runVeraPostPaymentWorkflowWithResults(input.orderId);
    } catch (error) {
        console.error('[vera-workflow] Workflow post-creazione ordine manuale fallito:', {
            orderId: input.orderId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
