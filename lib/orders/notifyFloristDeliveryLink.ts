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
 * Notifica fiorista — cascata Punto A (4 template sul primo ordine).
 * Parte su creazione/assegnazione (chiamante); fuori fascia 08:00–20:00 Europe/Rome viene differito.
 * Sandbox (`isTest: true`) bypassa completamente la finestra: invio immediato a qualsiasi ora.
 * Il controllo already_sent/orfano è in runPuntoAFloristNewOrder (non qui).
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
            veraWorkflowFlags: true,
            partner: { select: { deletedAt: true } },
        },
    });

    if (!order) return { ok: false, skipped: 'order_not_found' };
    if (!order.partnerId || order.partner?.deletedAt) {
        return { ok: false, skipped: 'no_partner_assigned' };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);

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
