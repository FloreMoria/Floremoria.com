import prisma from '@/lib/prisma';
import { getSession } from '@/lib/chatStore';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import {
    buildCustomerWaitingUpdateParams,
    buildFloristReminderParams,
} from '@/lib/whatsapp/veraTemplateParams';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { getLastInboundAt } from '@/lib/whatsapp/messagingWindow';
import {
    markWorkflowStep,
    parseWorkflowFlags,
    VERA_REMINDER_HOURS,
    type VeraWorkflowFlags,
    type VeraWorkflowStep,
} from '@/lib/vera/orderWorkflow/types';

const MS_PER_HOUR = 60 * 60 * 1000;

function hoursSince(date: Date | null | undefined): number {
    if (!date) return Number.POSITIVE_INFINITY;
    return (Date.now() - date.getTime()) / MS_PER_HOUR;
}

/** Timestamp ISO del flag puntoG: se assente o più vecchio di 20h → si può reinviare. */
function lastKeepAliveAt(flags: VeraWorkflowFlags, step: VeraWorkflowStep): Date | null {
    const raw = flags[step];
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function canSendKeepAlive(flags: VeraWorkflowFlags, step: VeraWorkflowStep): boolean {
    return hoursSince(lastKeepAliveAt(flags, step)) >= VERA_REMINDER_HOURS;
}

/**
 * Ancora temporale per la finestra Meta: ultimo inbound (risposta utente/fiorista).
 * Se non c'è mai stato inbound, usa il riferimento ordine (createdAt / accettazione).
 * Il keep-alive parte a ~20h dall'ancora per sollecitare una risposta e riaprire la finestra.
 */
function resolveWindowAnchor(params: {
    lastInboundAt: Date | null;
    orderCreatedAt: Date;
    orderUpdatedAt: Date;
}): Date {
    if (params.lastInboundAt) return params.lastInboundAt;
    // Nessuna risposta: ancora = creazione ordine (o ultimo update se più recente e sensato).
    return params.orderCreatedAt.getTime() <= params.orderUpdatedAt.getTime()
        ? params.orderCreatedAt
        : params.orderUpdatedAt;
}

export interface PuntoGRunResult {
    customerReminders: number;
    floristReminders: number;
    skipped: number;
    errors: string[];
}

/**
 * PUNTO G — Keep-alive finestra Meta a 20 ore per ordini incompleti.
 *
 * Meta apre/riapre la finestra 24h solo con un messaggio INBOUND.
 * Quindi ogni ~20h (dal ultimo inbound, o dall'inizio conversazione se non ha mai risposto)
 * inviamo un template che invita a rispondere, finché l'ordine non è completato.
 * I flag puntoG_* memorizzano l'ISO dell'ultimo invio (ricorrenti, non one-shot).
 */
export async function runPuntoGOrderReminders(): Promise<PuntoGRunResult> {
    const result: PuntoGRunResult = {
        customerReminders: 0,
        floristReminders: 0,
        skipped: 0,
        errors: [],
    };

    const openOrders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            partnerPaymentStatus: 'PAID',
            status: { in: ['ACCEPTED', 'IN_PROGRESS', 'PENDING', 'DELIVERING'] },
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
        if (order.deliveryProof?.status === 'COMPLETED') {
            result.skipped += 1;
            continue;
        }

        // Non sollecitare troppo in anticipo rispetto a consegna/funerale programmati.
        const targetDate = order.deliveryDate || order.funeralDate;
        if (targetDate) {
            const diffHours = (targetDate.getTime() - Date.now()) / MS_PER_HOUR;
            if (diffHours > 48) {
                result.skipped += 1;
                continue;
            }
        }

        let currentFlags = parseWorkflowFlags(order.veraWorkflowFlags);
        let flagsDirty = false;

        // ── Cliente ──────────────────────────────────────────────
        const customerPhoneE164 = normalizePhoneE164(order.customerPhone);
        if (customerPhoneE164 && canSendKeepAlive(currentFlags, 'puntoG_customer_wait')) {
            try {
                const session = await getSession(`whatsapp:${customerPhoneE164}`);
                const lastInboundAt = getLastInboundAt(session);
                const anchor = resolveWindowAnchor({
                    lastInboundAt,
                    orderCreatedAt: order.createdAt,
                    orderUpdatedAt: order.updatedAt,
                });

                if (hoursSince(anchor) >= VERA_REMINDER_HOURS) {
                    const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
                    const bodyParams = buildCustomerWaitingUpdateParams({
                        buyerFirstName: name,
                        deceasedName: order.deceasedName,
                    });
                    const send = await sendVeraTemplate(customerPhoneE164, 'customer_waiting_update', bodyParams);
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
                } else {
                    result.skipped += 1;
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                result.errors.push(`customer ${order.orderNumber}: ${msg}`);
            }
        }

        // ── Fiorista ─────────────────────────────────────────────
        const floristPhoneRaw = order.partner?.whatsappNumber?.trim();
        const floristPhoneE164 = normalizePhoneE164(floristPhoneRaw);
        if (floristPhoneE164 && canSendKeepAlive(currentFlags, 'puntoG_florist_reminder')) {
            try {
                const floristSession = await getSession(`whatsapp:${floristPhoneE164}`);
                const lastInboundAt = getLastInboundAt(floristSession);
                const anchor = resolveWindowAnchor({
                    lastInboundAt,
                    orderCreatedAt: order.createdAt,
                    orderUpdatedAt: order.updatedAt,
                });

                if (hoursSince(anchor) >= VERA_REMINDER_HOURS) {
                    const floristName = extractFirstName(
                        order.partner?.ownerName || order.partner?.shopName || 'Fiorista'
                    );
                    const bodyParams = buildFloristReminderParams({
                        floristFirstName: floristName,
                        orderCode: order.orderNumber || order.id,
                        deceasedName: order.deceasedName,
                    });
                    const send = await sendVeraTemplate(floristPhoneE164, 'florist_reminder', bodyParams);
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
                } else {
                    result.skipped += 1;
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                result.errors.push(`florist ${order.orderNumber}: ${msg}`);
            }
        }

        if (flagsDirty) {
            await prisma.order.update({
                where: { id: order.id },
                data: { veraWorkflowFlags: currentFlags },
            });
        }
    }

    console.info('[vera-puntoG] keep-alive 20h', {
        customerReminders: result.customerReminders,
        floristReminders: result.floristReminders,
        skipped: result.skipped,
        errors: result.errors.length,
    });

    return result;
}
