import prisma from '@/lib/prisma';
import { notifyCustomerDeliveryComplete } from '@/lib/deliveryProof/notifyCustomerDeliveryComplete';
import { buildProactiveStaffParams } from '@/lib/whatsapp/veraTemplateParams';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import {
    isWhatsAppAutoNotifyDisabledForOrder,
    shouldSkipTestOrderMetaSend,
} from '@/lib/whatsapp/outboundGuards';

export interface PuntoEFResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    error?: string;
}

/**
 * PUNTO E/F — Foto utente (inline o template) + ringraziamento fiorista.
 */
export async function runPuntoEFDeliveryComplete(orderId: string): Promise<PuntoEFResult> {
    const orderEarly = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { id: true, orderNumber: true, isTest: true },
    });
    if (!orderEarly) return { ok: false, skipped: 'order_not_found' };
    if (isWhatsAppAutoNotifyDisabledForOrder(orderEarly.isTest)) {
        return { ok: true, skipped: 'auto_notify_disabled' };
    }
    if (shouldSkipTestOrderMetaSend(orderEarly.isTest)) {
        return { ok: true, skipped: 'test_order_meta_blocked' };
    }

    const customerResult = await notifyCustomerDeliveryComplete(orderId);
    if (!customerResult.ok) {
        return {
            ok: false,
            skipped: customerResult.skipped,
            giardinoUrl: customerResult.giardinoUrl,
            error: customerResult.error,
        };
    }

    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { partner: true },
    });
    if (!order) return { ok: false, skipped: 'order_not_found' };

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (!isWorkflowStepDone(flags, 'puntoEF_delivery')) {
        if (order.partner?.whatsappNumber?.trim()) {
            const floristName = extractFirstName(
                order.partner.ownerName || order.partner.shopName
            );
            const staffNote =
                'La ringraziamo per la consegna e per le foto inviate. Restiamo a disposizione per eventuali aggiornamenti.';

            const { bodyParams, headerTextParams } = buildProactiveStaffParams({
                floristFirstName: floristName,
                orderCode: order.orderNumber || order.id,
                staffNotes: staffNote,
            });

            await sendVeraTemplate(order.partner.whatsappNumber, 'proactive_staff', bodyParams, {
                headerTextParams,
            });
        }

        await prisma.order.update({
            where: { id: order.id },
            data: { veraWorkflowFlags: markWorkflowStep(flags, 'puntoEF_delivery') },
        });
    }

    return { ok: true, giardinoUrl: customerResult.giardinoUrl };
}
