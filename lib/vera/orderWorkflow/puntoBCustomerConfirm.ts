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
import { addMessage, updateSessionProfile } from '@/lib/chatStore';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';

export interface PuntoBResult {
    ok: boolean;
    skipped?: string;
    error?: string;
}

/**
 * PUNTO B — Conferma ordine utente via template Meta + pensiero caloroso Gemini ({{3}}).
 */
export async function runPuntoBCustomerOrderConfirm(orderId: string): Promise<PuntoBResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { user: { select: { name: true } } },
    });

    if (!order) return { ok: false, skipped: 'order_not_found' };

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (isWorkflowStepDone(flags, 'puntoB_customer')) {
        return { ok: true, skipped: 'already_sent' };
    }

    const phoneE164 = normalizePhoneE164(order.customerPhone);
    if (!phoneE164) return { ok: false, skipped: 'invalid_phone' };

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

    const sessionPhone = `whatsapp:${phoneE164}`;
    const preview = `Gentile ${buyerName || 'Utente'}, conferma ordine per ${order.deceasedName}. ${warmThought}`;
    await addMessage(sessionPhone, 'OUTBOUND', preview, undefined, {
        eventType: 'ORDER_CONFIRM_TEMPLATE',
        orderId: order.id,
        ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
    }).catch(() => undefined);
    await updateSessionProfile(sessionPhone, { userType: 'UTENTE', name: buyerName || undefined }).catch(
        () => undefined
    );

    await prisma.order.update({
        where: { id: order.id },
        data: { veraWorkflowFlags: markWorkflowStep(flags, 'puntoB_customer') },
    });

    console.info(`[vera-workflow] Punto B OK ordine ${order.orderNumber || order.id}`);
    return { ok: true };
}
