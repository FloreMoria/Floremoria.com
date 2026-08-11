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
import { isOrderStatusBlockingVeraAutomation } from '@/lib/vera/orderWorkflow/blockPendingAutomation';

/** Finestra promemoria: da 0 a 72h (3 giorni) prima della consegna — mai un mese prima. */
const REMINDER_MAX_HOURS_BEFORE = 72;
const MS_PER_HOUR = 60 * 60 * 1000;

export interface PuntoGRunResult {
    customerReminders: number;
    floristReminders: number;
    skipped: number;
    errors: string[];
}

/**
 * PUNTO G — Un solo sollecito per ordine (cliente + fiorista), 2–3 giorni prima della consegna.
 *
 * Perché one-shot: i keep-alive ricorrenti ogni ~20h inviavano lo stesso template
 * ieri e oggi (stesso testo a Isabella / Antonella). Non è accettabile sul canale commemorativo.
 * La finestra Meta 24h resta gestita da inbound reali; non si “tiene aperta” con messaggi doppi.
 * PENDING/ATTESA: esclusi (solo intervento umano da dashboard).
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

        // Senza data consegna/funerale non sollecitare (evita messaggi a chi non ha urgenza operativa).
        const targetDate = order.deliveryDate || order.funeralDate;
        if (!targetDate) {
            result.skipped += 1;
            continue;
        }
        const diffHours = (targetDate.getTime() - Date.now()) / MS_PER_HOUR;
        // Solo entro 72h (3 giorni) dalla consegna — mai anticipi di settimane/mesi.
        if (diffHours > REMINDER_MAX_HOURS_BEFORE || diffHours < -12) {
            result.skipped += 1;
            continue;
        }

        let currentFlags = parseWorkflowFlags(order.veraWorkflowFlags);
        let flagsDirty = false;

        // ── Cliente: un solo aggiornamento attesa per ordine ──
        const customerPhoneE164 = normalizePhoneE164(order.customerPhone);
        if (customerPhoneE164 && !isWorkflowStepDone(currentFlags, 'puntoG_customer_wait')) {
            try {
                const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
                const bodyParams = buildCustomerWaitingUpdateParams({
                    buyerFirstName: name,
                    deceasedName: order.deceasedName,
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
                    flagsDirty = true;
                    result.customerReminders += 1;
                } else if (send.error) {
                    result.errors.push(`customer ${order.orderNumber}: ${send.error}`);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                result.errors.push(`customer ${order.orderNumber}: ${msg}`);
            }
        } else if (isWorkflowStepDone(currentFlags, 'puntoG_customer_wait')) {
            result.skipped += 1;
        }

        // ── Fiorista: un solo sollecito per ordine ──
        const floristPhoneRaw = order.partner?.whatsappNumber?.trim();
        const floristPhoneE164 = normalizePhoneE164(floristPhoneRaw);
        if (floristPhoneE164 && !isWorkflowStepDone(currentFlags, 'puntoG_florist_reminder')) {
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
        } else if (isWorkflowStepDone(currentFlags, 'puntoG_florist_reminder')) {
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
