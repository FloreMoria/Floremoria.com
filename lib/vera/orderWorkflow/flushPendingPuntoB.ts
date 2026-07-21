import prisma from '@/lib/prisma';
import { isCustomerConfirmSendDue } from '@/lib/datetime/customerConfirmSchedule';
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import { isWorkflowStepDone, parseWorkflowFlags } from '@/lib/vera/orderWorkflow/types';

export interface FlushPendingPuntoBResult {
    scanned: number;
    sent: number;
    deferred: number;
    skipped: number;
    errors: string[];
}

/**
 * Spedisce Punto B in sospeso quando l'orario schedulato è dovuto.
 * Perché: +30 min / 08:30 non possono restare bloccati su un'unica richiesta serverless.
 */
export async function flushPendingPuntoBCustomerConfirm(): Promise<FlushPendingPuntoBResult> {
    const result: FlushPendingPuntoBResult = {
        scanned: 0,
        sent: 0,
        deferred: 0,
        skipped: 0,
        errors: [],
    };

    const now = new Date();
    const candidates = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS'] },
            customerPhone: { not: null },
        },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            isTest: true,
            veraWorkflowFlags: true,
        },
        take: 80,
        orderBy: { createdAt: 'asc' },
    });

    for (const order of candidates) {
        result.scanned += 1;
        const flags = parseWorkflowFlags(order.veraWorkflowFlags);
        if (isWorkflowStepDone(flags, 'puntoB_customer')) {
            result.skipped += 1;
            continue;
        }

        const scheduledRaw = flags.puntoB_customer_scheduled;
        if (!scheduledRaw) {
            result.skipped += 1;
            continue;
        }

        const sendAt = new Date(scheduledRaw);
        if (Number.isNaN(sendAt.getTime()) || !isCustomerConfirmSendDue(sendAt, now)) {
            result.deferred += 1;
            continue;
        }

        try {
            const notify = await runPuntoBCustomerOrderConfirm(order.id, {
                bypassSchedule: true,
            });
            if (notify.deferred) {
                result.deferred += 1;
            } else if (notify.ok && !notify.skipped) {
                result.sent += 1;
            } else if (
                notify.ok &&
                (notify.skipped === 'already_sent' || notify.skipped === 'duplicate_order_template')
            ) {
                result.skipped += 1;
            } else if (notify.skipped) {
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
