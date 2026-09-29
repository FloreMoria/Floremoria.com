import prisma from '@/lib/prisma';

export type ZoneLeaderMatch = {
    id: string;
    shopName: string;
    assignedProvinces: string[];
};

/**
 * Leader ACTIVE la cui zona affidata include la provincia di consegna.
 * Perché: affido automatico FVG (e future zone) senza toccare territori senza Leader.
 */
export async function findActiveZoneLeader(
    deliveryProvince: string | null | undefined
): Promise<ZoneLeaderMatch | null> {
    const prov = (deliveryProvince || '').trim().toUpperCase().slice(0, 2);
    if (!prov || prov.length !== 2) return null;

    const leaders = await prisma.partner.findMany({
        where: {
            deletedAt: null,
            isActive: true,
            networkRole: 'LEADER',
            networkStatus: 'ACTIVE',
            assignedProvinces: { has: prov },
        },
        select: { id: true, shopName: true, assignedProvinces: true },
        take: 2,
    });

    if (leaders.length === 0) return null;
    if (leaders.length > 1) {
        console.warn('[florist-network] Più Leader ACTIVE sulla stessa provincia — uso il primo', {
            province: prov,
            leaderIds: leaders.map((l) => l.id),
        });
    }
    return leaders[0];
}

/** True se partnerId è un Leader ACTIVE e la provincia è nella sua zona. */
export async function isOrderInLeaderZone(input: {
    partnerId: string | null | undefined;
    deliveryProvince: string | null | undefined;
}): Promise<{ ok: boolean; leader: ZoneLeaderMatch | null }> {
    if (!input.partnerId) return { ok: false, leader: null };
    const leader = await findActiveZoneLeader(input.deliveryProvince);
    if (!leader || leader.id !== input.partnerId) return { ok: false, leader: null };
    return { ok: true, leader };
}
