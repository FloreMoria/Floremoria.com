import prisma from '@/lib/prisma';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import { runPuntoEFDeliveryComplete } from '@/lib/vera/orderWorkflow/puntoEFDeliveryComplete';
import { sendWhatsAppTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { GOOGLE_REVIEW_URL } from '@/lib/whatsapp/veraTemplateRegistry';

/**
 * Filtro WhatsApp sugli stati ordine.
 * Punto A (fiorista) + Punto B (cliente): solo a IN_PROGRESS (In Lavorazione).
 */
export async function onOrderStatusChanged(orderId: string, nextStatus: string): Promise<void> {
    console.info(`[order-status-filter] Stato dell'ordine ${orderId} cambiato in: ${nextStatus}`);

    try {
        if (nextStatus === 'IN_PROGRESS') {
            // Cliente prima, poi fiorista (stesso numero: il template cliente apre il thread).
            const customerResult = await runPuntoBCustomerOrderConfirm(orderId).catch((err) => {
                console.error('[order-status-filter] Errore in runPuntoBCustomerOrderConfirm:', err);
                return null;
            });
            console.info('[order-status-filter] Punto B risultato', {
                orderId,
                result: customerResult,
            });

            const floristResult = await notifyFloristDeliveryLinkForOrder(orderId).catch((err) => {
                console.error('[order-status-filter] Errore in notifyFloristDeliveryLinkForOrder (Punto A):', err);
                return null;
            });
            console.info('[order-status-filter] Punto A risultato', {
                orderId,
                result: floristResult,
            });
        } else if (
            nextStatus === 'DELIVERING' ||
            nextStatus === 'COMPLETED' ||
            nextStatus === 'DELIVERED_UNPAID'
        ) {
            // Mini-app e foto WhatsApp chiudono in COMPLETED; DELIVERING resta supportato per legacy.
            await runPuntoEFDeliveryComplete(orderId).catch((err) => {
                console.error('[order-status-filter] Errore in runPuntoEFDeliveryComplete:', err);
            });
        }
    } catch (error) {
        console.error(`[order-status-filter] Errore durante l'elaborazione del cambio stato per ordine ${orderId}:`, error);
    }
}
