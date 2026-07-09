import prisma from '@/lib/prisma';
import { getSession } from '@/lib/chatStore';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { buildCustomerWaitingUpdateParams } from '@/lib/whatsapp/veraTemplateParams';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';

export interface ResendCustomerWaitingUpdateResult {
    ok: boolean;
    orderNumber: string;
    phoneE164?: string;
    buyerFirstName?: string;
    deceasedName?: string;
    error?: string;
    skipped?: string;
    chatLogged?: boolean;
}

async function logWaitingUpdateToChat(input: {
    phoneE164: string;
    orderId: string;
    orderNumber: string | null;
    buyerFirstName: string;
    deceasedName: string;
    messageId?: string;
    buyerDisplayName?: string | null;
}): Promise<void> {
    const bodyParams = buildCustomerWaitingUpdateParams({
        buyerFirstName: input.buyerFirstName,
        deceasedName: input.deceasedName,
    });
    await logVeraTemplateOutbound({
        phoneE164: input.phoneE164,
        templateId: 'customer_waiting_update',
        bodyParams,
        eventType: 'WAITING_UPDATE_TEMPLATE',
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        messageId: input.messageId,
        contactName: input.buyerDisplayName || input.buyerFirstName,
        userType: 'UTENTE',
    });
}

/**
 * Registra in dashboard un aggiornamento attesa già inviato (senza reinvio WhatsApp).
 */
export async function backfillCustomerWaitingUpdateChatLog(
    orderNumber: string
): Promise<ResendCustomerWaitingUpdateResult> {
    const normalizedOrderNumber = orderNumber.trim();
    const order = await prisma.order.findFirst({
        where: { orderNumber: normalizedOrderNumber, deletedAt: null },
        include: { user: { select: { name: true } } },
    });

    if (!order) {
        return { ok: false, orderNumber: normalizedOrderNumber, error: 'Ordine non trovato' };
    }

    const phoneE164 = normalizePhoneE164(order.customerPhone);
    if (!phoneE164) {
        return {
            ok: false,
            orderNumber: normalizedOrderNumber,
            error: `Telefono cliente non valido: ${order.customerPhone}`,
        };
    }

    const buyerFirstName = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
    const deceasedName = order.deceasedName || 'chi ama';
    const sessionPhone = `whatsapp:${phoneE164}`;
    const session = await getSession(sessionPhone);
    const alreadyLogged = session.messages.some(
        (message) =>
            message.direction === 'OUTBOUND' &&
            message.metadata?.eventType === 'WAITING_UPDATE_TEMPLATE' &&
            message.metadata?.orderNumber === normalizedOrderNumber
    );

    if (alreadyLogged) {
        return {
            ok: true,
            orderNumber: normalizedOrderNumber,
            phoneE164,
            buyerFirstName,
            deceasedName,
            chatLogged: false,
            skipped: 'chat_già_registrata',
        };
    }

    await logWaitingUpdateToChat({
        phoneE164,
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerFirstName,
        deceasedName,
        buyerDisplayName: order.user?.name || order.buyerFullName,
    });

    return {
        ok: true,
        orderNumber: normalizedOrderNumber,
        phoneE164,
        buyerFirstName,
        deceasedName,
        chatLogged: true,
    };
}

/**
 * Rinvio manuale template aggiornamento attesa (Punto G) per un singolo ordine.
 * Con force=true ignora il flag puntoG_customer_wait e i guard temporali del cron.
 */
export async function resendCustomerWaitingUpdateForOrder(
    orderNumber: string,
    options: { force?: boolean } = {}
): Promise<ResendCustomerWaitingUpdateResult> {
    const normalizedOrderNumber = orderNumber.trim();
    if (!normalizedOrderNumber) {
        return { ok: false, orderNumber: orderNumber, error: 'orderNumber mancante' };
    }

    const order = await prisma.order.findFirst({
        where: { orderNumber: normalizedOrderNumber, deletedAt: null },
        include: { user: { select: { name: true } } },
    });

    if (!order) {
        return { ok: false, orderNumber: normalizedOrderNumber, error: 'Ordine non trovato' };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (!options.force && isWorkflowStepDone(flags, 'puntoG_customer_wait')) {
        return {
            ok: false,
            orderNumber: normalizedOrderNumber,
            skipped: 'puntoG_customer_wait già completato (usa force=true per reinviare)',
        };
    }

    const phoneE164 = normalizePhoneE164(order.customerPhone);
    if (!phoneE164) {
        return {
            ok: false,
            orderNumber: normalizedOrderNumber,
            error: `Telefono cliente non valido: ${order.customerPhone}`,
        };
    }

    const buyerFirstName = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
    const deceasedName = order.deceasedName || 'chi ama';
    const bodyParams = buildCustomerWaitingUpdateParams({
        buyerFirstName,
        deceasedName,
    });

    const send = await sendVeraTemplate(phoneE164, 'customer_waiting_update', bodyParams);
    if (!send.ok) {
        return {
            ok: false,
            orderNumber: normalizedOrderNumber,
            phoneE164,
            buyerFirstName: bodyParams[0],
            deceasedName: bodyParams[1],
            error: send.error || 'Invio template fallito',
        };
    }

    await logWaitingUpdateToChat({
        phoneE164,
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerFirstName: bodyParams[0],
        deceasedName: bodyParams[1],
        messageId: send.messageId,
        buyerDisplayName: order.user?.name || order.buyerFullName,
    });

    await prisma.order.update({
        where: { id: order.id },
        data: { veraWorkflowFlags: markWorkflowStep(flags, 'puntoG_customer_wait') },
    });

    return {
        ok: true,
        orderNumber: normalizedOrderNumber,
        phoneE164,
        buyerFirstName: bodyParams[0],
        deceasedName: bodyParams[1],
    };
}
