import prisma from '@/lib/prisma';
import { generateWarmOrderThought } from '@/lib/vera/generateWarmOrderThought';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import { buildCustomerOrderConfirmParams } from '@/lib/whatsapp/veraTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';

export interface PuntoBResult {
    ok: boolean;
    skipped?: string;
    error?: string;
}

export interface PuntoBOptions {
    /** Reinvio manuale anche se puntoB_customer già marcato. */
    force?: boolean;
}

/**
 * PUNTO B — Conferma ordine utente via template Meta + pensiero caloroso Gemini ({{3}}).
 */
export async function runPuntoBCustomerOrderConfirm(
    orderId: string,
    options: PuntoBOptions = {}
): Promise<PuntoBResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { user: { select: { name: true } } },
    });

    if (!order) return { ok: false, skipped: 'order_not_found' };

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (!options.force && isWorkflowStepDone(flags, 'puntoB_customer')) {
        return { ok: true, skipped: 'already_sent' };
    }

    const phoneE164 = normalizePhoneE164(order.customerPhone);
    if (!phoneE164) {
        console.warn('[vera-workflow] Punto B saltato: telefono non valido', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
        });
        return { ok: false, skipped: 'invalid_phone' };
    }

    const buyerName = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
    const warmThought = await generateWarmOrderThought({
        buyerName,
        deceasedName: order.deceasedName,
    });

    const bodyParams = buildCustomerOrderConfirmParams({
        buyerFirstName: buyerName,
        deceasedName: order.deceasedName,
        warmThought,
    });

    const send = await sendVeraTemplate(phoneE164, 'customer_order_confirm', bodyParams);

    if (!send.ok) return { ok: false, error: send.error };

    try {
        await logVeraTemplateOutbound({
            phoneE164,
            templateId: 'customer_order_confirm',
            bodyParams,
            eventType: 'ORDER_CONFIRM_TEMPLATE',
            orderId: order.id,
            orderNumber: order.orderNumber,
            messageId: send.messageId,
            contactName: buyerName || order.buyerFullName || undefined,
            userType: 'UTENTE',
        });
    } catch (logErr) {
        console.error('[vera-workflow] Punto B inviato ma sessione dashboard non registrata:', logErr);
    }

    await prisma.order.update({
        where: { id: order.id },
        data: { veraWorkflowFlags: markWorkflowStep(flags, 'puntoB_customer') },
    });

    console.info(`[vera-workflow] Punto B OK ordine ${order.orderNumber || order.id}`);
    return { ok: true };
}
