import prisma from '@/lib/prisma';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import { findMatchingDeceasedProfile } from '@/lib/deceased/deceasedProfileIdentity';
import { shouldNotifyFloristDeliveryLink } from '@/lib/futuria/floristDeliveryLinkNotify';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';

export type AutoAssignKnownTombResult =
    | { assigned: true; deceasedProfileId: string; partnerId: string }
    | { assigned: false; reason: string };

/**
 * Tomba già censita + fiorista custode primario → collega ordine, porta a IN_PROGRESS
 * e innesca il WhatsApp al fiorista senza passaggio manuale in dashboard.
 */
export async function autoAssignKnownTombOrder(orderId: string): Promise<AutoAssignKnownTombResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            status: true,
            partnerPaymentStatus: true,
            deceasedName: true,
            cemeteryCity: true,
            cemeteryName: true,
        },
    });

    if (!order) {
        return { assigned: false, reason: 'order_not_found' };
    }
    if (order.partnerPaymentStatus !== 'PAID') {
        return { assigned: false, reason: 'not_paid' };
    }
    if (order.status !== 'ACCEPTED') {
        return { assigned: false, reason: 'status_not_accepted' };
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

    const profile = profileWithFlorist;

    const assignment = profile.partnerLinks[0];
    if (!assignment) {
        return { assigned: false, reason: 'no_primary_florist' };
    }

    const previousStatus = order.status;
    const deceasedProfileId = profile.id;
    const partnerId = assignment.partner.id;

    await prisma.order.update({
        where: { id: order.id },
        data: {
            deceasedProfileId,
            partnerId,
            status: 'IN_PROGRESS',
        },
    });

    await syncDeceasedRelationsForOrder(order.id);

    if (shouldNotifyFloristDeliveryLink(previousStatus, 'IN_PROGRESS')) {
        await notifyFloristDeliveryLinkForOrder(order.id).catch((err) => {
            console.error('[auto-assign-known-tomb] Invio link fiorista fallito (non bloccante):', err);
        });
    }

    console.info(
        `[auto-assign-known-tomb] Ordine ${orderId} → profilo ${deceasedProfileId}, fiorista ${partnerId}, IN_PROGRESS`
    );

    return { assigned: true, deceasedProfileId, partnerId };
}
