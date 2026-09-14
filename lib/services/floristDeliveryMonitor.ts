/**
 * Monitoraggio Consegne Fioristi e Solleciti Urgenti (< 6h).
 *
 * Logica Automazione Vera:
 * 1. Cerca gli ordini attivi non ancora consegnati (status 'PAID' / 'ACCEPTED' / 'IN_PROGRESS' / 'DELIVERING' / 'PENDING').
 * 2. Calcola le ore mancanti alla consegna.
 * 3. Se mancano meno di 6 ore (o scaduto da poco) e non è ancora stato inviato il sollecito urgente:
 *    a) Controlla se la finestra di conversazione Meta (24h) con il fiorista è aperta.
 *    b) Se aperta: invia messaggio di testo diretto da parte di Vera.
 *    c) Se chiusa: invia template approvato 'florist_reminder' (floremoria_sollecito_fiorista: {{1}} nome, {{2}} codice, {{3}} link).
 *    d) Traccia l'avvenuto invio in 'order.veraWorkflowFlags.floristReminderSentAt' per garantire idempotenza (one-shot).
 * 4. Registra l'evento nella chat di sistema del fiorista e nei log di audit.
 */

import prisma from '@/lib/prisma';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { normalizePhoneE164, sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';
import { getSession, addMessage, updateSessionProfile } from '@/lib/chatStore';
import { isWithinCustomerServiceWindow } from '@/lib/whatsapp/messagingWindow';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { buildFloristReminderParams } from '@/lib/whatsapp/veraTemplateParams';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import { isWhatsAppAutoNotifyDisabled } from '@/lib/whatsapp/outboundGuards';
import { parseWorkflowFlags } from '@/lib/vera/orderWorkflow/types';
import { getEffectiveDeliveryDeadline } from '@/lib/datetime/deliveryCountdown';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';
import { is24HourWindowError } from '@/lib/whatsapp/sendWhatsAppMessage';
import { toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';

export interface FloristDeliveryMonitorResult {
    ok: boolean;
    scannedOrders: number;
    urgentOrdersFound: number;
    notifiedCount: number;
    skippedCount: number;
    errors: string[];
    details: Array<{
        orderId: string;
        orderNumber: string | null;
        floristName: string;
        floristPhone: string;
        hoursLeft: number;
        deliveryDeadline: string;
        mode: 'direct_text' | 'template_florist_reminder' | 'skipped' | 'error';
        reason?: string;
    }>;
}

export interface FloristDeliveryMonitorOptions {
    force?: boolean;
    allowTest?: boolean;
    orderNumber?: string;
    orderId?: string;
    now?: Date;
}

export async function checkAndNotifyUrgentFloristDeliveries(
    options?: FloristDeliveryMonitorOptions
): Promise<FloristDeliveryMonitorResult> {
    const result: FloristDeliveryMonitorResult = {
        ok: true,
        scannedOrders: 0,
        urgentOrdersFound: 0,
        notifiedCount: 0,
        skippedCount: 0,
        errors: [],
        details: [],
    };

    if (isWhatsAppAutoNotifyDisabled() && !options?.force) {
        console.warn('[florist-delivery-monitor] Auto-notify disabilitato da configurazione');
        return result;
    }

    const now = options?.now || new Date();

    // Query ordini attivi
    const whereClause: any = {
        deletedAt: null,
        partnerId: { not: null },
        status: {
            notIn: [
                'DELIVERED',
                'COMPLETED',
                'CANCELLED',
                'DELIVERED_UNPAID',
                'DELIVERED_REFUNDED',
            ],
        },
    };

    if (!options?.allowTest) {
        whereClause.isTest = false;
    }

    if (options?.orderNumber) {
        whereClause.orderNumber = options.orderNumber;
    } else if (options?.orderId) {
        whereClause.id = options.orderId;
    }

    const orders = await prisma.order.findMany({
        where: whereClause,
        include: {
            partner: true,
            deliveryProof: true,
            user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
    });

    result.scannedOrders = orders.length;

    for (const order of orders) {
        // Se la prova di consegna è già completata, escludi
        if (order.deliveryProof?.status === 'COMPLETED') {
            continue;
        }

        const rawDeliveryDate = order.deliveryDate || order.funeralDate;
        if (!rawDeliveryDate) {
            continue;
        }

        const deadline = getEffectiveDeliveryDeadline(rawDeliveryDate);
        if (!deadline) {
            continue;
        }

        const diffMs = deadline.getTime() - now.getTime();
        const hoursLeft = diffMs / (60 * 60 * 1000);

        // Verifica soglia urgenza: mancano meno di 6 ore (o scaduto da meno di 48 ore)
        // Se scaduto da più di 48h è un ordine anomalo/storico da gestire manualmente
        const isUrgent = hoursLeft < 6 && hoursLeft >= -48;
        if (!isUrgent && !options?.force) {
            continue;
        }

        result.urgentOrdersFound += 1;

        const flags = parseWorkflowFlags(order.veraWorkflowFlags);
        const alreadySent = Boolean(flags.floristReminderSentAt || flags.puntoG_urgent_florist_reminder);

        if (alreadySent && !options?.force) {
            result.skippedCount += 1;
            result.details.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                floristName: order.partner?.shopName || order.partner?.ownerName || 'Fiorista',
                floristPhone: order.partner?.whatsappNumber || '',
                hoursLeft: Math.round(hoursLeft * 10) / 10,
                deliveryDeadline: deadline.toISOString(),
                mode: 'skipped',
                reason: `Sollecito urgente già inviato in data ${flags.floristReminderSentAt || flags.puntoG_urgent_florist_reminder}`,
            });
            continue;
        }

        const floristPhoneRaw = order.partner?.whatsappNumber?.trim();
        const floristPhoneE164 = normalizePhoneE164(floristPhoneRaw);

        if (!floristPhoneE164) {
            result.skippedCount += 1;
            const errMsg = `Fiorista ${order.partner?.shopName} senza numero WhatsApp valido per ordine ${order.orderNumber || order.id}`;
            result.errors.push(errMsg);
            result.details.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                floristName: order.partner?.shopName || 'Fiorista',
                floristPhone: floristPhoneRaw || '',
                hoursLeft: Math.round(hoursLeft * 10) / 10,
                deliveryDeadline: deadline.toISOString(),
                mode: 'error',
                reason: errMsg,
            });
            continue;
        }

        const floristFirstName = extractFirstName(
            order.partner?.ownerName || order.partner?.shopName || 'Fiorista'
        ) || 'Fiorista';
        const orderCode = order.orderNumber || order.id.slice(-6).toUpperCase();
        const deliveryUrl = buildFloristDeliveryUrl({
            id: order.id,
            orderNumber: order.orderNumber,
        });

        const sessionPhone = toWhatsAppSessionPhone(floristPhoneE164) || `whatsapp:${floristPhoneE164}`;

        try {
            // Controlla la finestra 24h con il fiorista
            const session = await getSession(sessionPhone);
            const windowOpen = isWithinCustomerServiceWindow(session);

            let sendSuccess = false;
            let usedMode: 'direct_text' | 'template_florist_reminder' = 'template_florist_reminder';
            let messageId: string | undefined;

            if (windowOpen) {
                // Finestra 24h APERTA: invia testo diretto da parte di Vera
                const deceasedFormatted = order.deceasedName ? formatDeceasedName(order.deceasedName) : '';
                const deceasedPart = deceasedFormatted ? ` (in memoria di ${deceasedFormatted})` : '';
                const timeInfo = hoursLeft < 0
                    ? `è scaduta da ${Math.abs(Math.round(hoursLeft))}h`
                    : `mancano meno di ${Math.max(1, Math.ceil(hoursLeft))} ore`;

                const directText = `Ciao ${floristFirstName} 🌸\nTi ricordiamo con urgenza che per la consegna dell'ordine ${orderCode}${deceasedPart} ${timeInfo}.\n\nPer favore conferma lo stato o carica la foto non appena completata la posa:\n🔗 ${deliveryUrl}\n\nGrazie mille per il tuo prezioso supporto! 🌹\nStaff FloreMoria`;

                const textRes = await sendWhatsAppTextMessage(floristPhoneE164, directText);

                if (textRes.ok) {
                    sendSuccess = true;
                    usedMode = 'direct_text';
                    messageId = textRes.messageId;

                    await addMessage(sessionPhone, 'OUTBOUND', directText, undefined, {
                        source: 'vera_florist_delivery_monitor',
                        outboundMode: 'direct_urgent_reminder',
                        eventType: 'FLORIST_URGENT_REMINDER_DIRECT',
                        orderId: order.id,
                        orderNumber: order.orderNumber || '',
                        ...buildOutboundWamidMetadata(textRes.messageId),
                    });

                    await updateSessionProfile(sessionPhone, {
                        name: order.partner?.ownerName || order.partner?.shopName || floristFirstName,
                        userType: 'FLORIST',
                        status: 'AI_ACTIVE',
                    });
                } else if (is24HourWindowError(textRes)) {
                    // Fallback a template se la finestra era in realtà chiusa lato Meta
                    console.info(`[florist-delivery-monitor] Finestra chiusa lato Meta per ${sessionPhone}, fallback a template florist_reminder`);
                } else {
                    throw new Error(`Invio testo fiorista fallito: ${textRes.error}`);
                }
            }

            // Se la finestra era chiusa o l'invio testo ha richiesto fallback
            if (!sendSuccess) {
                const bodyParams = buildFloristReminderParams({
                    floristFirstName,
                    orderCode,
                    deliveryUrl,
                });

                const templateRes = await sendVeraTemplate(
                    floristPhoneE164,
                    'florist_reminder',
                    bodyParams,
                    {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        skipOrderDedup: options?.force,
                    }
                );

                if (templateRes.ok) {
                    sendSuccess = true;
                    usedMode = 'template_florist_reminder';
                    messageId = templateRes.messageId;

                    await logVeraTemplateOutbound({
                        phoneE164: floristPhoneE164,
                        templateId: 'florist_reminder',
                        bodyParams,
                        eventType: 'FLORIST_URGENT_REMINDER_TEMPLATE',
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        messageId: templateRes.messageId,
                        contactName: order.partner?.ownerName || order.partner?.shopName || floristFirstName,
                        userType: 'FLORIST',
                    });
                } else {
                    throw new Error(`Invio template florist_reminder fallito: ${templateRes.error}`);
                }
            }

            if (sendSuccess) {
                const updatedFlags = {
                    ...flags,
                    floristReminderSentAt: now.toISOString(),
                    puntoG_urgent_florist_reminder: now.toISOString(),
                };

                await prisma.order.update({
                    where: { id: order.id },
                    data: { veraWorkflowFlags: updatedFlags },
                });

                result.notifiedCount += 1;
                result.details.push({
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    floristName: order.partner?.shopName || order.partner?.ownerName || floristFirstName,
                    floristPhone: floristPhoneE164,
                    hoursLeft: Math.round(hoursLeft * 10) / 10,
                    deliveryDeadline: deadline.toISOString(),
                    mode: usedMode,
                    reason: `Sollecito urgente inviato con successo via ${usedMode} (messageId: ${messageId || 'n/d'})`,
                });

                console.info(
                    `[florist-delivery-monitor] ✅ Sollecito urgente inviato a ${floristFirstName} (${floristPhoneE164}) per ordine ${orderCode} [mode: ${usedMode}]`
                );
            }
        } catch (err) {
            const errStr = err instanceof Error ? err.message : String(err);
            result.errors.push(`Ordine ${order.orderNumber || order.id}: ${errStr}`);
            result.details.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                floristName: order.partner?.shopName || floristFirstName,
                floristPhone: floristPhoneE164,
                hoursLeft: Math.round(hoursLeft * 10) / 10,
                deliveryDeadline: deadline.toISOString(),
                mode: 'error',
                reason: errStr,
            });
            console.error(`[florist-delivery-monitor] ❌ Errore sollecito per ordine ${order.orderNumber || order.id}:`, err);
        }
    }

    if (result.errors.length > 0) {
        result.ok = false;
    }

    return result;
}
