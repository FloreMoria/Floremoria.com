import prisma from '@/lib/prisma';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import {
    buildCustomerWaitingUpdateParams,
    buildFloristReminderParams,
} from '@/lib/whatsapp/veraTemplateParams';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { isWhatsAppAutoNotifyDisabled } from '@/lib/whatsapp/outboundGuards';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import { wasOrderTemplateSent } from '@/lib/vera/orderWorkflow/orderOutboundDedup';
import { isOrderStatusBlockingVeraAutomation } from '@/lib/vera/orderWorkflow/blockPendingAutomation';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';

const MS_PER_HOUR = 60 * 60 * 1000;

export interface PuntoGRunResult {
    customerReminders: number;
    floristReminders: number;
    skipped: number;
    errors: string[];
}

/**
 * PUNTO G — Gestione notifiche proattive con vincolo TASSATIVO di unicità (Anti-Spam).
 *
 * REGOLE TASSATIVE:
 * 1. Rassicurazione Cliente (customer_waiting_update):
 *    - Inviabile AL MASSIMO UNA SOLA VOLTA nell'intero ciclo di vita dell'ordine.
 *    - Se la posa è entro 48 ore (o passata), NON si invia alcuna rassicurazione: il cliente attende direttamente la foto di consegna.
 *    - Inviata solo se l'ordine è stato creato da almeno 24h e la data di posa è lontana (> 48h).
 *    - Se già inviata (verificato sia su flags che su storico messaggi DB), MAI più ripetuta.
 * 2. Sollecito Fiorista (florist_reminder):
 *    - Inviabile AL MASSIMO UNA VOLTA, solo tra 24h e 72h prima della data di posa se il fiorista non ha ancora completato.
 */
export async function runPuntoGOrderReminders(): Promise<PuntoGRunResult> {
    const result: PuntoGRunResult = {
        customerReminders: 0,
        floristReminders: 0,
        skipped: 0,
        errors: [],
    };

    if (isWhatsAppAutoNotifyDisabled()) {
        console.warn('[vera-workflow] Punto G saltato (AUTO_NOTIFY disabled)');
        return result;
    }

    const openOrders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            partnerPaymentStatus: 'PAID',
            // PENDING/ATTESA esclusi: zero automazioni finché lo staff non passa a lavorazione.
            status: { in: ['ACCEPTED', 'IN_PROGRESS', 'DELIVERING'] },
            partnerId: { not: null },
        },
        include: {
            partner: true,
            deliveryProof: true,
            user: { select: { name: true } },
        },
        take: 300,
    });

    for (const order of openOrders) {
        if (isOrderStatusBlockingVeraAutomation(order.status)) {
            result.skipped += 1;
            continue;
        }

        if (order.deliveryProof?.status === 'COMPLETED') {
            result.skipped += 1;
            continue;
        }

        const targetDate = order.deliveryDate || order.funeralDate;
        if (!targetDate) {
            result.skipped += 1;
            continue;
        }
        const diffHours = (targetDate.getTime() - Date.now()) / MS_PER_HOUR;
        const orderAgeHours = (Date.now() - order.createdAt.getTime()) / MS_PER_HOUR;

        let currentFlags = parseWorkflowFlags(order.veraWorkflowFlags);
        let flagsDirty = false;

        // ── 1. RASSICURAZIONE CLIENTE (MAX 1 VOLTA, solo se data lontana > 48h) ──
        const customerPhoneE164 = normalizePhoneE164(order.customerPhone);
        const alreadyFlaggedCustomer =
            isWorkflowStepDone(currentFlags, 'puntoG_customer_wait') ||
            isWorkflowStepDone(currentFlags, 'hasSentReassuranceNudge') ||
            Boolean(currentFlags.hasSentReassuranceNudge);

        if (customerPhoneE164 && !alreadyFlaggedCustomer) {
            // Verifica storico comunicazioni (chat log a database)
            const alreadySentInChat = await wasOrderTemplateSent(
                order.id,
                'customer_waiting_update',
                order.orderNumber
            );

            if (alreadySentInChat) {
                // Auto-healing flags per evitare verifiche future
                currentFlags = markWorkflowStep(currentFlags, 'puntoG_customer_wait');
                currentFlags = markWorkflowStep(currentFlags, 'hasSentReassuranceNudge');
                flagsDirty = true;
                result.skipped += 1;
            } else {
                // Se la posa è entro 48 ore (o passata), NON inviare alcuna rassicurazione:
                // il cliente attende direttamente la foto di consegna.
                const isDeliveryFarAway = diffHours > 48 && diffHours <= 168; // tra 2 e 7 giorni prima
                const isOrderMature = orderAgeHours >= 24; // almeno 24h dopo il checkout

                if (!isDeliveryFarAway || !isOrderMature) {
                    result.skipped += 1;
                } else {
                    try {
                        const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
                        const formattedDeceased = formatDeceasedName(order.deceasedName, 'chi ama');
                        const bodyParams = buildCustomerWaitingUpdateParams({
                            buyerFirstName: name,
                            deceasedName: formattedDeceased,
                        });
                        const send = await sendVeraTemplate(customerPhoneE164, 'customer_waiting_update', bodyParams, {
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                        });
                        if (send.ok) {
                            await logVeraTemplateOutbound({
                                phoneE164: customerPhoneE164,
                                templateId: 'customer_waiting_update',
                                bodyParams,
                                eventType: 'WAITING_UPDATE_TEMPLATE',
                                orderId: order.id,
                                orderNumber: order.orderNumber,
                                messageId: send.messageId,
                                contactName: order.user?.name || order.buyerFullName || name,
                                userType: 'UTENTE',
                            });
                            currentFlags = markWorkflowStep(currentFlags, 'puntoG_customer_wait');
                            currentFlags = markWorkflowStep(currentFlags, 'hasSentReassuranceNudge');
                            flagsDirty = true;
                            result.customerReminders += 1;
                        } else if (send.error) {
                            result.errors.push(`customer ${order.orderNumber}: ${send.error}`);
                        }
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        result.errors.push(`customer ${order.orderNumber}: ${msg}`);
                    }
                }
            }
        } else if (alreadyFlaggedCustomer) {
            result.skipped += 1;
        }

        // ── 2. SOLLECITO FIORISTA (MAX 1 VOLTA, solo tra 24h e 72h dalla posa) ──
        const floristPhoneRaw = order.partner?.whatsappNumber?.trim();
        const floristPhoneE164 = normalizePhoneE164(floristPhoneRaw);
        const alreadyFlaggedFlorist = isWorkflowStepDone(currentFlags, 'puntoG_florist_reminder');

        if (floristPhoneE164 && !alreadyFlaggedFlorist) {
            const alreadySentFlorist = await wasOrderTemplateSent(
                order.id,
                'florist_reminder',
                order.orderNumber
            );

            if (alreadySentFlorist) {
                currentFlags = markWorkflowStep(currentFlags, 'puntoG_florist_reminder');
                flagsDirty = true;
                result.skipped += 1;
            } else if (diffHours > 72 || diffHours < 24) {
                // Sollecito fiorista solo nella finestra 24-72h prima della posa
                result.skipped += 1;
            } else {
                try {
                    const floristName = extractFirstName(
                        order.partner?.ownerName || order.partner?.shopName || 'Fiorista'
                    );
                    const { buildFloristDeliveryUrl } = await import('@/lib/orders/resolveOrderIdentifier');
                    const deliveryUrl = buildFloristDeliveryUrl({
                        id: order.id,
                        orderNumber: order.orderNumber,
                    });
                    const bodyParams = buildFloristReminderParams({
                        floristFirstName: floristName,
                        orderCode: order.orderNumber || order.id,
                        deliveryUrl,
                    });
                    const send = await sendVeraTemplate(floristPhoneE164, 'florist_reminder', bodyParams, {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                    });
                    if (send.ok) {
                        await logVeraTemplateOutbound({
                            phoneE164: floristPhoneE164,
                            templateId: 'florist_reminder',
                            bodyParams,
                            eventType: 'FLORIST_REMINDER_TEMPLATE',
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            messageId: send.messageId,
                            contactName: order.partner?.ownerName || order.partner?.shopName || floristName,
                            userType: 'FLORIST',
                        });
                        currentFlags = markWorkflowStep(currentFlags, 'puntoG_florist_reminder');
                        flagsDirty = true;
                        result.floristReminders += 1;
                    } else if (send.error) {
                        result.errors.push(`florist ${order.orderNumber}: ${send.error}`);
                    }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    result.errors.push(`florist ${order.orderNumber}: ${msg}`);
                }
            }
        } else if (alreadyFlaggedFlorist) {
            result.skipped += 1;
        }

        if (flagsDirty) {
            await prisma.order.update({
                where: { id: order.id },
                data: { veraWorkflowFlags: currentFlags },
            });
        }
    }

    console.info('[vera-puntoG] one-shot reminders', {
        customerReminders: result.customerReminders,
        floristReminders: result.floristReminders,
        skipped: result.skipped,
        errors: result.errors.length,
    });

    return result;
}
