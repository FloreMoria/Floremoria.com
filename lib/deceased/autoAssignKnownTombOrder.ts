import prisma from '@/lib/prisma';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import { findMatchingDeceasedProfile } from '@/lib/deceased/deceasedProfileIdentity';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';

export type AutoAssignKnownTombResult =
    | { assigned: true; deceasedProfileId: string; partnerId: string; becameInProgress: boolean }
    | { assigned: false; reason: string };

/**
 * Tomba già censita + fiorista custode primario → collega ordine e passa a IN_PROGRESS.
 * Perché: Punto A/B partono solo in In Lavorazione; se il defunto ha già il fiorista, avanziamo in automatico.
 */
export async function autoAssignKnownTombOrder(orderId: string): Promise<AutoAssignKnownTombResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            status: true,
            deceasedName: true,
            cemeteryCity: true,
            cemeteryName: true,
        },
    });

    if (!order) {
        return { assigned: false, reason: 'order_not_found' };
    }
    if (order.status !== 'ACCEPTED' && order.status !== 'PENDING' && order.status !== 'IN_PROGRESS') {
        return { assigned: false, reason: 'status_not_eligible' };
    }

    const matched = await findMatchingDeceasedProfile(order.deceasedName, order.cemeteryCity);
    if (!matched) {
        return { assigned: false, reason: 'no_censited_tomb_with_florist' };
    }

    const profileWithFlorist = await prisma.deceasedProfile.findFirst({
        where: {
            id: matched.id,
            partnerLinks: {
                some: {
                    isPrimary: true,
                    partner: { deletedAt: null },
                },
            },
        },
        include: {
            partnerLinks: {
                where: {
                    isPrimary: true,
                    partner: { deletedAt: null },
                },
                include: { partner: { select: { id: true } } },
                take: 1,
            },
        },
    });

    if (!profileWithFlorist) {
        return { assigned: false, reason: 'no_censited_tomb_with_florist' };
    }

    const assignment = profileWithFlorist.partnerLinks[0];
    if (!assignment) {
        return { assigned: false, reason: 'no_primary_florist' };
    }

    const deceasedProfileId = profileWithFlorist.id;
    const partnerId = assignment.partner.id;
    const becameInProgress = order.status !== 'IN_PROGRESS';

    await prisma.order.update({
        where: { id: order.id },
        data: {
            deceasedProfileId,
            partnerId,
            status: 'IN_PROGRESS',
        },
    });

    await syncDeceasedRelationsForOrder(order.id);

    if (becameInProgress) {
        await onOrderStatusChanged(order.id, 'IN_PROGRESS').catch((err) => {
            console.error('[auto-assign-known-tomb] onOrderStatusChanged fallita (non bloccante):', err);
        });
    } else {
        await notifyFloristDeliveryLinkForOrder(order.id).catch((err) => {
            console.error('[auto-assign-known-tomb] Notifica Punto A fallita (non bloccante):', err);
        });
    }

    console.info(
        `[auto-assign-known-tomb] Ordine ${orderId} → profilo ${deceasedProfileId}, fiorista ${partnerId}, IN_PROGRESS (became=${becameInProgress})`
    );

    return { assigned: true, deceasedProfileId, partnerId, becameInProgress };
}
