import prisma from '@/lib/prisma';
import { notifyCustomerDeliveryComplete } from '@/lib/deliveryProof/notifyCustomerDeliveryComplete';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';

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

            await sendVeraTemplate(order.partner.whatsappNumber, 'proactive_staff', [
                floristName,
                staffNote,
            ], {
                headerTextParams: [order.orderNumber || order.id],
            });
        }

        await prisma.order.update({
            where: { id: order.id },
            data: { veraWorkflowFlags: markWorkflowStep(flags, 'puntoEF_delivery') },
        });
    }

    return { ok: true, giardinoUrl: customerResult.giardinoUrl };
}
