import prisma from '@/lib/prisma';
import { isWithinFloristNotifyWindow } from '@/lib/datetime/floristNotifyWindow';
import { runPuntoAFloristNewOrder } from '@/lib/vera/orderWorkflow/puntoAFloristNewOrder';
import {
    isWorkflowStepDone,
    parseWorkflowFlags,
    type VeraWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';

export interface FloristDeliveryNotifyResult {
    ok: boolean;
    skipped?: string;
    blocked?: boolean;
    isFirstOrder?: boolean;
    channel?: 'vera_meta_template';
    error?: string;
    deferred?: boolean;
}

async function markPuntoADeferred(orderId: string, flags: VeraWorkflowFlags): Promise<void> {
    await prisma.order.update({
        where: { id: orderId },
        data: {
            veraWorkflowFlags: {
                ...flags,
                puntoA_florist_deferred: new Date().toISOString(),
            },
        },
    });
}

/**
 * Notifica fiorista — Punto A.
 * Solo stato IN_PROGRESS. Fuori fascia 08:00–20:00 Europe/Rome → differito (sandbox bypass).
 */
export async function notifyFloristDeliveryLinkForOrder(
    orderId: string,
    options: { force?: boolean; bypassWindow?: boolean } = {}
): Promise<FloristDeliveryNotifyResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            status: true,
            partnerId: true,
            isTest: true,
            orderNumber: true,
            veraWorkflowFlags: true,
            partner: { select: { deletedAt: true } },
        },
    });

    if (!order) return { ok: false, skipped: 'order_not_found' };
    if (order.status !== 'IN_PROGRESS' && !options.force) {
        return { ok: true, skipped: 'not_in_progress' };
    }
    if (!order.partnerId || order.partner?.deletedAt) {
        return { ok: false, skipped: 'no_partner_assigned' };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);

    // P1: se staff e fiorista hanno già un accordo recente in chat, non re-sparare "nuova consegna".
    if (!options.force) {
        const { hasRecentStaffFloristAgreement } = await import('@/lib/vera/staffFloristAgreement');
        const partnerPhone = await prisma.partner.findFirst({
            where: { id: order.partnerId, deletedAt: null },
            select: { whatsappNumber: true },
        });
        const agreed = await hasRecentStaffFloristAgreement({
            partnerWhatsApp: partnerPhone?.whatsappNumber,
            orderNumber: order.orderNumber,
            withinHours: 72,
        });
        if (agreed) {
            console.info(
                `[vera-workflow] Punto A saltato (accordo staff-fiorista recente in chat) ordine ${order.orderNumber || order.id}`
            );
            return { ok: true, skipped: 'recent_staff_florist_agreement' };
        }
    }

    // Fuori fascia (solo Produzione): non inviare ora; il cron flusha al rientro 08:00–20:00.
    // Sandbox / Test Mode (isTest = true) ignora il blocco d'orario.
    const shouldBypassWindow = options.bypassWindow || order.isTest === true;
    if (!options.force && !shouldBypassWindow && !isWithinFloristNotifyWindow()) {
        if (!isWorkflowStepDone(flags, 'puntoA_florist')) {
            await markPuntoADeferred(order.id, flags).catch((err) => {
                console.error('[vera-workflow] Impossibile marcare Punto A differito:', err);
            });
            console.info(
                `[vera-workflow] Punto A differito (fuori fascia 08:00–20:00 Europe/Rome) ordine ${order.id}`
            );
            return { ok: true, deferred: true, skipped: 'outside_notify_window' };
        }
    }

    const result = await runPuntoAFloristNewOrder(orderId, { force: options.force });
    if (result.blocked) {
        return {
            ok: false,
            blocked: true,
            isFirstOrder: result.isFirstOrder,
            skipped: result.error,
        };
    }
    if (!result.ok) {
        return { ok: false, error: result.error, skipped: result.skipped };
    }

    return {
        ok: true,
        isFirstOrder: result.isFirstOrder,
        channel: 'vera_meta_template',
        skipped: result.skipped,
    };
}
