import prisma from '@/lib/prisma';
import { findActiveZoneLeader } from '@/lib/floristNetwork/findZoneLeader';
import { isFuneralOrderNumber } from '@/lib/orders/isFuneralOrder';

export type AssignZoneLeaderResult =
    | { status: 'assigned'; partnerId: string; previousPartnerId: string | null }
    | { status: 'skipped'; reason: string };

/**
 * Affido automatico al Leader di zona su ordine pagato (qualsiasi canale).
 * Non modifica referral QR. Non tocca ordini senza provincia in zona Leader.
 * Funerali FF: skip (assegnazione manuale staff).
 */
export async function assignZoneLeaderOnPaid(orderId: string): Promise<AssignZoneLeaderResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            partnerId: true,
            deliveryProvince: true,
            isTest: true,
        },
    });
    if (!order) return { status: 'skipped', reason: 'order_not_found' };
    if (isFuneralOrderNumber(order.orderNumber)) {
        return { status: 'skipped', reason: 'funeral_manual_assignment' };
    }

    const leader = await findActiveZoneLeader(order.deliveryProvince);
    if (!leader) return { status: 'skipped', reason: 'no_zone_leader' };

    if (order.partnerId === leader.id) {
        return { status: 'assigned', partnerId: leader.id, previousPartnerId: order.partnerId };
    }

    await prisma.order.update({
        where: { id: order.id },
        data: {
            partnerId: leader.id,
            assignedAt: new Date(),
        },
    });

    console.info('[florist-network] Affido zona → Leader', {
        orderId,
        orderNumber: order.orderNumber,
        province: order.deliveryProvince,
        previousPartnerId: order.partnerId,
        leaderId: leader.id,
        leaderShop: leader.shopName,
    });

    return {
        status: 'assigned',
        partnerId: leader.id,
        previousPartnerId: order.partnerId,
    };
}
