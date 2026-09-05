import prisma from '@/lib/prisma';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import { findMatchingDeceasedProfile } from '@/lib/deceased/deceasedProfileIdentity';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { runFloristScoutForOrderIfNeeded } from '@/lib/ai/floristScoutOrder';
import { isFuneralOrderNumber } from '@/lib/orders/isFuneralOrder';

export type AutoAssignKnownTombResult =
    | { assigned: true; deceasedProfileId: string; partnerId: string; becameInProgress: boolean }
    | { assigned: false; reason: string };

function normalizeCity(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/**
 * Tomba già censita + fiorista custode primario → collega ordine e passa a IN_PROGRESS.
 * Fallback: fiorista di copertura sul comune del cimitero.
 *
 * Eccezione funerale (FF): mai auto-assegnare — resta in attesa assegnazione manuale staff.
 */
export async function autoAssignKnownTombOrder(orderId: string): Promise<AutoAssignKnownTombResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            status: true,
            orderNumber: true,
            deceasedName: true,
            cemeteryCity: true,
            cemeteryName: true,
            partnerId: true,
        },
    });

    if (!order) {
        return { assigned: false, reason: 'order_not_found' };
    }

    if (isFuneralOrderNumber(order.orderNumber)) {
        console.info(
            `[auto-assign-known-tomb] SKIP funerale ${order.orderNumber}: attesa assegnazione manuale`
        );
        return { assigned: false, reason: 'funeral_manual_assignment_required' };
    }

    if (order.status !== 'ACCEPTED' && order.status !== 'PENDING' && order.status !== 'IN_PROGRESS') {
        return { assigned: false, reason: 'status_not_eligible' };
    }

    let deceasedProfileId: string | null = null;
    let partnerId: string | null = null;

    const matched = await findMatchingDeceasedProfile(order.deceasedName, order.cemeteryCity);
    if (matched) {
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
        if (profileWithFlorist?.partnerLinks[0]) {
            deceasedProfileId = profileWithFlorist.id;
            partnerId = profileWithFlorist.partnerLinks[0].partner.id;
        } else {
            deceasedProfileId = matched.id;
        }
    }

    if (!partnerId) {
        const cityNorm = normalizeCity(order.cemeteryCity);
        const coveragePartners = await prisma.partner.findMany({
            where: { deletedAt: null, isActive: true, isB2B: false },
            select: { id: true, coverageArea: true },
            take: 500,
        });
        const hit = coveragePartners.find((p) => {
            const cov = normalizeCity(p.coverageArea || '');
            if (!cov || !cityNorm) return false;
            return cityNorm.includes(cov) || cov.includes(cityNorm.split(' ')[0] || '');
        });
        if (hit) partnerId = hit.id;
    }

    if (!partnerId) {
        await runFloristScoutForOrderIfNeeded(orderId).catch((err) => {
            console.error('[auto-assign-known-tomb] Florist Scout AI fallito (non bloccante):', err);
        });
        return { assigned: false, reason: 'no_censited_tomb_with_florist' };
    }

    if (!deceasedProfileId && matched) {
        deceasedProfileId = matched.id;
    }

    const becameInProgress = order.status !== 'IN_PROGRESS';

    await prisma.order.update({
        where: { id: order.id },
        data: {
            ...(deceasedProfileId ? { deceasedProfileId } : {}),
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
        `[auto-assign-known-tomb] Ordine ${orderId} → profilo ${deceasedProfileId || 'n/d'}, fiorista ${partnerId}, IN_PROGRESS (became=${becameInProgress})`
    );

    return {
        assigned: true,
        deceasedProfileId: deceasedProfileId || '',
        partnerId,
        becameInProgress,
    };
}
