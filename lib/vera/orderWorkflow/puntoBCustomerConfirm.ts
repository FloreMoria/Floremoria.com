import prisma from '@/lib/prisma';
import { generateWarmOrderThought } from '@/lib/vera/generateWarmOrderThought';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import { wasOrderTemplateSent } from '@/lib/vera/orderWorkflow/orderOutboundDedup';
import {
    releaseWorkflowStep,
    tryClaimWorkflowStep,
} from '@/lib/vera/orderWorkflow/claimWorkflowStep';
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
    /** Solo reinvio manuale staff esplicito. Mai usare da onOrderStatusChanged. */
    force?: boolean;
}

/**
 * PUNTO B — Conferma ordine utente.
 * Claim atomico + dedup chat: impossibile reiniare lo stesso template per lo stesso ordine
 * tranne force manuale.
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

    if (!options.force) {
        if (isWorkflowStepDone(flags, 'puntoB_customer')) {
            return { ok: true, skipped: 'already_sent' };
        }

        if (await wasOrderTemplateSent(order.id, 'customer_order_confirm', order.orderNumber)) {
            // Allinea flag se manca (messaggio già in chat).
            await tryClaimWorkflowStep(order.id, 'puntoB_customer');
            console.info(
                `[vera-workflow] Punto B BLOCCATO duplicato chat ordine ${order.orderNumber || order.id}`
            );
            return { ok: true, skipped: 'duplicate_order_template' };
        }

        const claimed = await tryClaimWorkflowStep(order.id, 'puntoB_customer');
        if (!claimed) {
            console.info(
                `[vera-workflow] Punto B BLOCCATO claim (già preso) ordine ${order.orderNumber || order.id}`
            );
            return { ok: true, skipped: 'already_sent' };
        }
    }

    const phoneE164 = normalizePhoneE164(order.customerPhone);
    if (!phoneE164) {
        if (!options.force) await releaseWorkflowStep(order.id, 'puntoB_customer');
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

    if (!send.ok) {
        if (!options.force) await releaseWorkflowStep(order.id, 'puntoB_customer');
        return { ok: false, error: send.error };
    }

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

    // Con force, marca comunque lo step (claim poteva già esserci).
    if (options.force) {
        await prisma.order.update({
            where: { id: order.id },
            data: {
                veraWorkflowFlags: markWorkflowStep(
                    parseWorkflowFlags(order.veraWorkflowFlags),
                    'puntoB_customer'
                ),
            },
        });
    }

    console.info(`[vera-workflow] Punto B OK ordine ${order.orderNumber || order.id}`);
    return { ok: true };
}
