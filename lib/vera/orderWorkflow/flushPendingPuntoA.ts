import prisma from '@/lib/prisma';
import { isWithinFloristNotifyWindow } from '@/lib/datetime/floristNotifyWindow';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { isWorkflowStepDone, parseWorkflowFlags } from '@/lib/vera/orderWorkflow/types';
import { isWhatsAppAutoNotifyDisabled } from '@/lib/whatsapp/outboundGuards';

export interface FlushPendingPuntoAResult {
    scanned: number;
    sent: number;
    deferred: number;
    skipped: number;
    errors: string[];
}

/**
 * Spedisce Punto A in sospeso: ordini con fiorista, senza puntoA_florist.
 * Perché: se creazione/assegnazione è scattata fuori fascia, i template partono al rientro 08:00–20:00.
 * Sandbox (isTest) non passa da qui: bypassa già la finestra all'invio.
 */
export async function flushPendingPuntoAFloristNotifications(): Promise<FlushPendingPuntoAResult> {
    const result: FlushPendingPuntoAResult = {
        scanned: 0,
        sent: 0,
        deferred: 0,
        skipped: 0,
        errors: [],
    };

    if (isWhatsAppAutoNotifyDisabled()) {
        console.warn('[vera-workflow] Flush Punto A saltato (AUTO_NOTIFY disabled)');
        return result;
    }

    if (!isWithinFloristNotifyWindow()) {
        return result;
    }

    const candidates = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            partnerId: { not: null },
            status: { in: ['IN_PROGRESS'] },
        },
        select: {
            id: true,
            orderNumber: true,
            veraWorkflowFlags: true,
        },
        take: 80,
        orderBy: { updatedAt: 'asc' },
    });

    for (const order of candidates) {
        result.scanned += 1;
        const flags = parseWorkflowFlags(order.veraWorkflowFlags);
        if (isWorkflowStepDone(flags, 'puntoA_florist')) {
            result.skipped += 1;
            continue;
        }

        try {
            const notify = await notifyFloristDeliveryLinkForOrder(order.id, {
                bypassWindow: true,
            });
            if (notify.deferred) {
                result.deferred += 1;
            } else if (notify.ok && !notify.skipped) {
                result.sent += 1;
            } else if (notify.ok && notify.skipped === 'already_sent') {
                result.skipped += 1;
            } else if (notify.blocked || notify.skipped) {
                result.skipped += 1;
            } else {
                result.errors.push(
                    `${order.orderNumber || order.id}: ${notify.error || notify.skipped || 'failed'}`
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            result.errors.push(`${order.orderNumber || order.id}: ${message}`);
        }
    }

    return result;
}
