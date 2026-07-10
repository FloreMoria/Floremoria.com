import prisma from '@/lib/prisma';
import { getSession } from '@/lib/chatStore';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { generateWarmOrderThought } from '@/lib/vera/generateWarmOrderThought';
import { buildCustomerOrderConfirmParams } from '@/lib/whatsapp/veraTemplateParams';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { calculateFloristCompensation } from '@/lib/pricing/calculateFloristCompensation';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { parseWorkflowFlags } from '@/lib/vera/orderWorkflow/types';
import type { VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';

export interface BackfillOrderChatLogResult {
    ok: boolean;
    orderNumber: string;
    orderId?: string;
    customerPhone?: string | null;
    phoneE164?: string;
    veraWorkflowFlags?: unknown;
    customerMessagesBefore?: number;
    customerMessagesAfter?: number;
    results?: Record<string, string>;
    error?: string;
}

function orderHasLumino(items: Array<{ product: { slug?: string | null; name?: string | null } }>): boolean {
    return items.some((i) => {
        const label = `${i.product.slug || ''} ${i.product.name || ''}`.toLowerCase();
        return /lumino|set-ceri|ceri|candele/.test(label);
    });
}

function orderHasBigliettino(
    items: Array<{ product: { slug?: string | null; name?: string | null } }>,
    ticketMessage?: string | null
): boolean {
    if (ticketMessage?.trim()) return true;
    return items.some((i) => {
        const label = `${i.product.slug || ''} ${i.product.name || ''}`.toLowerCase();
        return /messaggio|bigliett|nastro/.test(label);
    });
}

/**
 * Registra in dashboard i messaggi template VERA già inviati (senza reinvio WhatsApp).
 */
export async function backfillOrderChatLog(orderNumber: string): Promise<BackfillOrderChatLogResult> {
    const normalizedOrderNumber = orderNumber.trim();
    if (!normalizedOrderNumber) {
        return { ok: false, orderNumber: orderNumber, error: 'orderNumber mancante' };
    }

    const order = await prisma.order.findFirst({
        where: { orderNumber: normalizedOrderNumber, deletedAt: null },
        include: {
            user: { select: { name: true } },
            partner: true,
            items: { include: { product: true } },
        },
    });

    if (!order) {
        return { ok: false, orderNumber: normalizedOrderNumber, error: 'Ordine non trovato' };
    }

    const phoneE164 = normalizePhoneE164(order.customerPhone);
    if (!phoneE164) {
        return {
            ok: false,
            orderNumber: normalizedOrderNumber,
            orderId: order.id,
            customerPhone: order.customerPhone,
            error: `Telefono cliente non valido: ${order.customerPhone}`,
        };
    }

    const sessionPhone = `whatsapp:${phoneE164}`;
    const sessionBefore = await getSession(sessionPhone);
    const results: Record<string, string> = {};

    const buyerName = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
    const hasOrderConfirm = sessionBefore.messages.some(
        (m) =>
            m.direction === 'OUTBOUND' &&
            (m.metadata?.eventType === 'ORDER_CONFIRM_TEMPLATE' ||
                m.metadata?.templateId === 'customer_order_confirm')
    );

    if (!hasOrderConfirm) {
        const warmThought = await generateWarmOrderThought({
            buyerName,
            deceasedName: order.deceasedName,
        });
        const bodyParams = buildCustomerOrderConfirmParams({
            buyerFirstName: buyerName,
            deceasedName: order.deceasedName,
            warmThought,
        });
        await logVeraTemplateOutbound({
            phoneE164,
            templateId: 'customer_order_confirm',
            bodyParams,
            eventType: 'ORDER_CONFIRM_TEMPLATE',
            orderId: order.id,
            orderNumber: order.orderNumber,
            contactName: buyerName || order.buyerFullName || undefined,
            userType: 'UTENTE',
        });
        results.customerOrderConfirm = 'backfilled';
    } else {
        results.customerOrderConfirm = 'already_present';
    }

    if (order.partner?.whatsappNumber?.trim()) {
        const floristPhoneE164 = normalizePhoneE164(order.partner.whatsappNumber.trim());
        if (!floristPhoneE164) {
            results.florist = `invalid_phone:${order.partner.whatsappNumber}`;
        } else {
            const floristName = extractFirstName(order.partner.ownerName || order.partner.shopName);
            const floristSession = await getSession(`whatsapp:${floristPhoneE164}`);
            const hasFloristLog = floristSession.messages.some(
                (m) =>
                    m.direction === 'OUTBOUND' &&
                    m.metadata?.orderNumber === order.orderNumber &&
                    m.metadata?.eventType === 'FLORIST_NEW_ORDER_TEMPLATE'
            );

            if (!hasFloristLog) {
                const deliveryUrl = buildFloristDeliveryUrl({ id: order.id, orderNumber: order.orderNumber });
                const compensation = calculateFloristCompensation(order.items);
                const orderCode = order.orderNumber || order.id;
                const cemeteryLabel = [order.cemeteryName, order.cemeteryCity].filter(Boolean).join(', ');

                const logFlorist = async (templateId: VeraTemplateId, bodyParams: string[]) => {
                    await logVeraTemplateOutbound({
                        phoneE164: floristPhoneE164,
                        templateId,
                        bodyParams,
                        eventType: 'FLORIST_NEW_ORDER_TEMPLATE',
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        contactName: floristName,
                        userType: 'FLORIST',
                    });
                };

                if (order.isFirstOrderForPartner) {
                    const lumino = orderHasLumino(order.items);
                    const bigliettino = orderHasBigliettino(order.items, order.ticketMessage);
                    const steps: Array<{ template: VeraTemplateId; params: string[] }> = [
                        { template: 'florist_first_001', params: [floristName, orderCode, compensation.totalLabel] },
                        {
                            template: 'florist_first_002',
                            params: [lumino ? 'Sì' : 'No', bigliettino ? 'Sì' : 'No', order.ticketMessage?.trim() || '—'],
                        },
                        {
                            template: 'florist_first_003',
                            params: [order.deceasedName, cemeteryLabel, order.gravePosition?.trim() || '—'],
                        },
                        { template: 'florist_first_004', params: [deliveryUrl] },
                    ];
                    for (const step of steps) {
                        await logFlorist(step.template, step.params);
                    }
                    results.florist = 'backfilled_first_order_cascade';
                } else {
                    await logFlorist('florist_repeat', [
                        floristName,
                        order.deceasedName,
                        cemeteryLabel,
                        deliveryUrl,
                        orderCode,
                        compensation.totalLabel,
                    ]);
                    results.florist = 'backfilled_repeat';
                }
            } else {
                results.florist = 'already_present';
            }
        }
    } else {
        results.florist = 'no_partner_whatsapp';
    }

    const sessionAfter = await getSession(sessionPhone);

    return {
        ok: true,
        orderNumber: normalizedOrderNumber,
        orderId: order.id,
        customerPhone: order.customerPhone,
        phoneE164,
        veraWorkflowFlags: parseWorkflowFlags(order.veraWorkflowFlags),
        customerMessagesBefore: sessionBefore.messages.length,
        customerMessagesAfter: sessionAfter.messages.length,
        results,
    };
}
