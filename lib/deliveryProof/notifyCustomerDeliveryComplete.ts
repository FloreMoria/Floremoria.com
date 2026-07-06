/**
 * Orchestratore unico workflow VERA post-consegna (Punto E/F).
 */
import { runPuntoEFDeliveryComplete } from '@/lib/vera/orderWorkflow/puntoEFDeliveryComplete';

export interface NotifyCustomerDeliveryCompleteResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    error?: string;
}

export async function notifyCustomerDeliveryComplete(
    orderId: string
): Promise<NotifyCustomerDeliveryCompleteResult> {
    return runPuntoEFDeliveryComplete(orderId);
}
