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
        } else if (nextStatus === 'DELIVERING') {
            await runPuntoEFDeliveryComplete(orderId).catch((err) => {
                console.error('[order-status-filter] Errore in runPuntoEFDeliveryComplete:', err);
            });
        } else if (nextStatus === 'COMPLETED') {
            const order = await prisma.order.findUnique({
                where: { id: orderId },
                include: { user: true },
            });

            if (order) {
                const phoneE164 = normalizePhoneE164(order.customerPhone);
                if (phoneE164) {
                    const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);

                    const thanksText = `Gentile ${name || 'Cliente'},\nLa ringraziamo per aver scelto FloreMoria. Se serve altro, siamo qui. 🌹`;
                    await sendWhatsAppTextMessage(phoneE164, thanksText).catch((err) => {
                        console.error('[order-status-filter] Errore invio ringraziamento:', err);
                    });

                    const userId = order.userId;
                    let isFirstOrder = true;

                    if (userId) {
                        const pastOrdersCount = await prisma.order.count({
                            where: {
                                userId,
                                deletedAt: null,
                                id: { not: orderId },
                                deliveryProof: { status: 'COMPLETED' },
                            },
                        });
                        if (pastOrdersCount > 0) {
                            isFirstOrder = false;
                        }
                    }

                    if (isFirstOrder) {
                        const reviewText =
                            `Se desidera, può lasciare una recensione sulla sua esperienza qui: ${GOOGLE_REVIEW_URL}\n\n` +
                            `Il Suo feedback ci aiuta a prendere cura di ogni ricordo con ancora più dedizione. Grazie ancora da tutto lo Staff.`;
                        await sendWhatsAppTextMessage(phoneE164, reviewText).catch((err) => {
                            console.error('[order-status-filter] Errore invio richiesta recensione:', err);
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error(`[order-status-filter] Errore durante l'elaborazione del cambio stato per ordine ${orderId}:`, error);
    }
}
