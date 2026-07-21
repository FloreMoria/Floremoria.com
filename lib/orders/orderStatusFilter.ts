import prisma from '@/lib/prisma';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import { runPuntoEFDeliveryComplete } from '@/lib/vera/orderWorkflow/puntoEFDeliveryComplete';
import { tryRunPuntoHReviewRequest } from '@/lib/vera/orderWorkflow/puntoHReview';
import { sendWhatsAppTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { GOOGLE_REVIEW_URL } from '@/lib/whatsapp/veraTemplateRegistry';

/**
 * Filtro di Sicurezza WhatsApp per la gestione dei flussi e delle notifiche degli ordini.
 * Intercetta le transizioni di stato (manuali da dashboard o automatiche).
 *
 * Regola Punto A: cascata fiorista (ft_001…004) SOLO su IN_PROGRESS, fascia 8:30–19:30 Europe/Rome.
 * Regola Punto B: customer_order_confirm SOLO su IN_PROGRESS, mai su ACCEPTED/pagamento.
 */
export async function onOrderStatusChanged(orderId: string, nextStatus: string): Promise<void> {
    console.info(`[order-status-filter] Stato dell'ordine ${orderId} cambiato in: ${nextStatus}`);

    try {
        if (nextStatus === 'IN_PROGRESS' || nextStatus === 'ACCEPTED' || nextStatus === 'PENDING') {
            // Cascata fiorista (claim atomico + dedup per template).
            const floristResult = await notifyFloristDeliveryLinkForOrder(orderId).catch((err) => {
                console.error('[order-status-filter] Errore in notifyFloristDeliveryLinkForOrder (Punto A):', err);
                return null;
            });
            console.info('[order-status-filter] Punto A risultato', {
                orderId,
                result: floristResult,
            });

            // Conferma cliente: MAI force. Claim atomico + dedup chat bloccano ogni reinvio.
            const customerResult = await runPuntoBCustomerOrderConfirm(orderId).catch((err) => {
                console.error('[order-status-filter] Errore in runPuntoBCustomerOrderConfirm:', err);
                return null;
            });
            console.info('[order-status-filter] Punto B risultato', {
                orderId,
                result: customerResult,
            });
        } else if (nextStatus === 'DELIVERING') {
            // "In Consegna": Inviare messaggio con le foto ed il MagikLink per la consegna effettuata (Template di Meta).
            // Al fiorista gli si invia un messaggio di ringraziamento del buon lavoro e lo si saluta gentilmente.
            await runPuntoEFDeliveryComplete(orderId).catch((err) => {
                console.error('[order-status-filter] Errore in runPuntoEFDeliveryComplete:', err);
            });
        } else if (nextStatus === 'COMPLETED') {
            // "Completato": Inviare messaggio di ringraziamento e se l'utente è nuovo, chiedere la recensione (Template di Meta)
            const order = await prisma.order.findUnique({
                where: { id: orderId },
                include: { user: true },
            });

            if (order) {
                const phoneE164 = normalizePhoneE164(order.customerPhone);
                if (phoneE164) {
                    const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
                    
                    // Messaggio di ringraziamento (tono asciutto)
                    const thanksText = `Gentile ${name || 'Cliente'},\nLa ringraziamo per aver scelto FloreMoria. Se serve altro, siamo qui. 🌹`;
                    await sendWhatsAppTextMessage(phoneE164, thanksText).catch((err) => {
                        console.error('[order-status-filter] Errore invio ringraziamento:', err);
                    });

                    // Verifica se l'utente è nuovo (primo ordine) per chiedere la recensione
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
