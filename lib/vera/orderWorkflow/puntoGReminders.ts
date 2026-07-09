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
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
    VERA_REMINDER_HOURS,
} from '@/lib/vera/orderWorkflow/types';

const MS_PER_HOUR = 60 * 60 * 1000;

function hoursSince(date: Date): number {
    return (Date.now() - date.getTime()) / MS_PER_HOUR;
}

export interface PuntoGRunResult {
    customerReminders: number;
    floristReminders: number;
    errors: string[];
}

/**
 * PUNTO G — Regola 20 ore: aggiornamento attesa utente / sollecito fiorista.
 */
export async function runPuntoGOrderReminders(): Promise<PuntoGRunResult> {
    const result: PuntoGRunResult = { customerReminders: 0, floristReminders: 0, errors: [] };

    const openOrders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            partnerPaymentStatus: 'PAID',
            status: { in: ['ACCEPTED', 'IN_PROGRESS', 'PENDING'] },
            partnerId: { not: null },
        },
        include: {
            partner: true,
            deliveryProof: true,
            user: { select: { name: true, hasLeftGoogleReview: true } },
        },
        take: 200,
    });

    for (const order of openOrders) {
        if (order.deliveryProof?.status === 'COMPLETED') continue;

        const flags = parseWorkflowFlags(order.veraWorkflowFlags);
        const referenceTime = order.updatedAt;

        if (hoursSince(referenceTime) < VERA_REMINDER_HOURS) continue;

        const phoneE164 = normalizePhoneE164(order.customerPhone);
        if (
            phoneE164 &&
            !isWorkflowStepDone(flags, 'puntoG_customer_wait')
        ) {
            const session = await getSession(`whatsapp:${phoneE164}`);
            const lastInbound = [...session.messages]
                .reverse()
                .find((m) => m.direction === 'INBOUND');
            const lastInboundAt = lastInbound?.createdAt
                ? new Date(lastInbound.createdAt)
                : referenceTime;

            if (hoursSince(lastInboundAt) >= VERA_REMINDER_HOURS) {
                try {
                    const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
                    const bodyParams = buildCustomerWaitingUpdateParams({
                        buyerFirstName: name,
                        deceasedName: order.deceasedName,
                    });
                    const send = await sendVeraTemplate(phoneE164, 'customer_waiting_update', bodyParams);
                    if (send.ok) {
                        await logVeraTemplateOutbound({
                            phoneE164,
                            templateId: 'customer_waiting_update',
                            bodyParams,
                            eventType: 'WAITING_UPDATE_TEMPLATE',
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            messageId: send.messageId,
                            contactName: order.user?.name || order.buyerFullName || name,
                            userType: 'UTENTE',
                        });
                        await prisma.order.update({
                            where: { id: order.id },
                            data: {
                                veraWorkflowFlags: markWorkflowStep(flags, 'puntoG_customer_wait'),
                            },
                        });
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

        const floristPhone = order.partner?.whatsappNumber?.trim();
        if (
            floristPhone &&
            !isWorkflowStepDone(flags, 'puntoG_florist_reminder')
        ) {
            try {
                const floristName = extractFirstName(
                    order.partner?.ownerName || order.partner?.shopName || 'Fiorista'
                );
                const bodyParams = buildFloristReminderParams({
                    floristFirstName: floristName,
                    orderCode: order.orderNumber || order.id,
                    deceasedName: order.deceasedName,
                });
                const send = await sendVeraTemplate(floristPhone, 'florist_reminder', bodyParams);
                if (send.ok) {
                    await prisma.order.update({
                        where: { id: order.id },
                        data: {
                            veraWorkflowFlags: markWorkflowStep(
                                parseWorkflowFlags(order.veraWorkflowFlags),
                                'puntoG_florist_reminder'
                            ),
                        },
                    });
                    result.floristReminders += 1;
                } else if (send.error) {
                    result.errors.push(`florist ${order.orderNumber}: ${send.error}`);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                result.errors.push(`florist ${order.orderNumber}: ${msg}`);
            }
        }
    }

    return result;
}
