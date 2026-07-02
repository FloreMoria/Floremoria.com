import prisma from '@/lib/prisma';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { compareByRecentActivity, compareBySurname } from '@/lib/dashboard/sortDashboardLists';

export type DeceasedLeaderRow = {
    rowKey: string;
    isOrphan: boolean;
    deceasedProfileId: string | null;
    orphanSeedOrderId: string | null;
    fullName: string;
    photoUrl: string | null;
    birthDate: string | null;
    deathDate: string | null;
    cemeteryCity: string;
    cemeteryName: string | null;
    gravePosition: string | null;
    orderCount: number;
    linkedUserCount: number;
    floristName: string | null;
    floristPartnerId: string | null;
    updatedAt: string;
};

function buildOrphanRowKey(deceasedName: string, cemeteryCity: string, cemeteryName: string): string {
    return `orphan:${deceasedName.trim().toLowerCase()}|${cemeteryCity.trim().toLowerCase()}|${cemeteryName.trim().toLowerCase()}`;
}

function pickLatestOrderDates<T extends { deceasedBirthDate: Date | null; deceasedDeathDate: Date | null; gravePosition: string | null; createdAt: Date }>(
    orders: T[]
): T | undefined {
    return orders[0];
}

/** Tabella leader: profili registrati + righe orfane da ordini senza DeceasedProfile. */
export async function listDeceasedLeaderRows(): Promise<DeceasedLeaderRow[]> {
    const profiles = await prisma.deceasedProfile.findMany({
        include: {
            orders: {
                where: visibleDashboardOrdersWhere(),
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    deceasedBirthDate: true,
                    deceasedDeathDate: true,
                    gravePosition: true,
                    cemeteryName: true,
                    cemeteryCity: true,
                    createdAt: true,
                },
            },
            userLinks: { select: { id: true } },
            partnerLinks: {
                where: { isPrimary: true },
                include: { partner: { select: { id: true, shopName: true, deletedAt: true } } },
                take: 1,
            },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const profileRows: DeceasedLeaderRow[] = profiles.map((profile) => {
        const latest = pickLatestOrderDates(profile.orders);
        const assignment = profile.partnerLinks.find((l) => l.partner.deletedAt == null);

        return {
            rowKey: profile.id,
            isOrphan: false,
            deceasedProfileId: profile.id,
            orphanSeedOrderId: null,
            fullName: profile.fullName,
            photoUrl: profile.photoUrl ?? null,
            birthDate: latest?.deceasedBirthDate?.toISOString() ?? null,
            deathDate: latest?.deceasedDeathDate?.toISOString() ?? null,
            cemeteryCity: profile.cemeteryCity,
            cemeteryName: profile.cemeteryName ?? latest?.cemeteryName ?? null,
            gravePosition: latest?.gravePosition ?? null,
            orderCount: profile.orders.length,
            linkedUserCount: profile.userLinks.length,
            floristName: assignment?.partner.shopName ?? null,
            floristPartnerId: assignment?.partner.id ?? null,
            updatedAt: profile.updatedAt.toISOString(),
        };
    });

    const orphanOrders = await prisma.order.findMany({
        where: {
            ...visibleDashboardOrdersWhere(),
            deceasedProfileId: null,
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            deceasedName: true,
            deceasedBirthDate: true,
            deceasedDeathDate: true,
            cemeteryCity: true,
            cemeteryName: true,
            gravePosition: true,
            createdAt: true,
        },
    });

    const orphanGroups = new Map<string, typeof orphanOrders>();
    for (const order of orphanOrders) {
        const key = buildOrphanRowKey(order.deceasedName, order.cemeteryCity, order.cemeteryName);
        const group = orphanGroups.get(key) ?? [];
        group.push(order);
        orphanGroups.set(key, group);
    }

    const orphanRows: DeceasedLeaderRow[] = Array.from(orphanGroups.entries()).map(([rowKey, orders]) => {
        const sorted = [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const latest = sorted[0]!;

        return {
            rowKey,
            isOrphan: true,
            deceasedProfileId: null,
            orphanSeedOrderId: latest.id,
            fullName: latest.deceasedName,
            photoUrl: null,
            birthDate: latest.deceasedBirthDate?.toISOString() ?? null,
            deathDate: latest.deceasedDeathDate?.toISOString() ?? null,
            cemeteryCity: latest.cemeteryCity,
            cemeteryName: latest.cemeteryName,
            gravePosition: latest.gravePosition ?? null,
            orderCount: sorted.length,
            linkedUserCount: 0,
            floristName: null,
            floristPartnerId: null,
            updatedAt: latest.createdAt.toISOString(),
        };
    });

    return [...profileRows, ...orphanRows].sort((a, b) =>
        compareByRecentActivity(
            { updatedAt: a.updatedAt, createdAt: a.updatedAt },
            { updatedAt: b.updatedAt, createdAt: b.updatedAt }
        )
    );
}

export { buildOrphanRowKey };
