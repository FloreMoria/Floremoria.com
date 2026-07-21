import prisma from '@/lib/prisma';
import { isWithinFloristNotifyWindow } from '@/lib/datetime/floristNotifyWindow';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { isWorkflowStepDone, parseWorkflowFlags } from '@/lib/vera/orderWorkflow/types';

export interface FlushPendingPuntoAResult {
    scanned: number;
    sent: number;
    deferred: number;
    skipped: number;
    errors: string[];
}

/**
 * Spedisce Punto A in sospeso: ordini IN_PROGRESS con fiorista, senza puntoA_florist.
 * Perché: se "In Lavorazione" è scattato fuori fascia, i 4 template partono al rientro 8:30–19:30.
 */
export async function flushPendingPuntoAFloristNotifications(): Promise<FlushPendingPuntoAResult> {
    const result: FlushPendingPuntoAResult = {
        scanned: 0,
        sent: 0,
        deferred: 0,
        skipped: 0,
        errors: [],
    };

    if (!isWithinFloristNotifyWindow()) {
        return result;
    }

    const candidates = await prisma.order.findMany({
        where: {
            deletedAt: null,
            status: 'IN_PROGRESS',
            partnerId: { not: null },
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
