import prisma from '@/lib/prisma';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import { findMatchingDeceasedProfile } from '@/lib/deceased/deceasedProfileIdentity';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';

export type AutoAssignKnownTombResult =
    | { assigned: true; deceasedProfileId: string; partnerId: string }
    | { assigned: false; reason: string };

/**
 * Tomba già censita + fiorista custode primario → collega ordine e lascia ACCEPTED.
 * Nessun vincolo su partnerPaymentStatus: in Dashboard/post-Stripe il pagamento è confermato.
 * L'assegnazione scatena subito Punto A (fascia 08:00–20:00 in prod; sandbox sempre attivo).
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

    const profile = profileWithFlorist;

    const assignment = profile.partnerLinks[0];
    if (!assignment) {
        return { assigned: false, reason: 'no_primary_florist' };
    }

    const deceasedProfileId = profile.id;
    const partnerId = assignment.partner.id;

    await prisma.order.update({
        where: { id: order.id },
        data: {
            deceasedProfileId,
            partnerId,
            status: order.status === 'PENDING' ? 'ACCEPTED' : order.status,
        },
    });

    await syncDeceasedRelationsForOrder(order.id);

    // Assegnazione → notifica fiorista subito (finestra rispettata in prod; bypass in sandbox).
    await notifyFloristDeliveryLinkForOrder(order.id).catch((err) => {
        console.error('[auto-assign-known-tomb] Notifica Punto A fallita (non bloccante):', err);
    });

    console.info(
        `[auto-assign-known-tomb] Ordine ${orderId} → profilo ${deceasedProfileId}, fiorista ${partnerId}, Punto A triggerato`
    );

    return { assigned: true, deceasedProfileId, partnerId };
}
