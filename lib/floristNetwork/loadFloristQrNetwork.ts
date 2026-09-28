import prisma from '@/lib/prisma';
import {
    currentAndPreviousMonthRome,
    floristPublicQrUrl,
    formatEuroFromCents,
    isQrFeeEligibleForTotals,
    monthBoundsUtc,
} from '@/lib/floristNetwork/qrAdminViews';

export type FloristQrNetworkMonthSummary = {
    year: number;
    monthIndex0: number;
    label: string;
    scansCount: number;
    qrOrdersCount: number;
    qrFeesCents: number;
    coordinationFeesCents: number;
    orders: Array<{
        orderNumber: string;
        createdAt: string;
        totalPriceCents: number;
        referralFeeCents: number;
        status: string;
    }>;
};

export type FloristQrNetworkPayload = {
    partnerId: string;
    shopName: string;
    slug: string | null;
    qrUrl: string | null;
    networkRole: string | null;
    networkStatus: string | null;
    assignedRegion: string | null;
    assignedProvinces: string[];
    preferredCities: string[];
    currentMonth: FloristQrNetworkMonthSummary;
    previousMonth: FloristQrNetworkMonthSummary;
};

async function summarizeMonth(partnerId: string, year: number, monthIndex0: number, label: string) {
    const { start, end } = monthBoundsUtc(year, monthIndex0);

    const [scansCount, qrOrdersRaw, coordinationAgg] = await Promise.all([
        prisma.floristScanEvent.count({
            where: { floristId: partnerId, createdAt: { gte: start, lt: end } },
        }),
        prisma.order.findMany({
            where: {
                referralFloristId: partnerId,
                createdAt: { gte: start, lt: end },
                deletedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            select: {
                orderNumber: true,
                createdAt: true,
                totalPriceCents: true,
                referralFeeCents: true,
                status: true,
                isTest: true,
                cancellationCause: true,
                deletedAt: true,
            },
        }),
        prisma.order.aggregate({
            where: {
                coordinatorFloristId: partnerId,
                createdAt: { gte: start, lt: end },
                deletedAt: null,
                isTest: false,
                status: { not: 'CANCELLED' },
            },
            _sum: { coordinationFeeCents: true },
            _count: { _all: true },
        }),
    ]);

    // Elenco prospetto: esclusi isTest e annullati Art. 3.3 (e in generale i CANCELLED).
    const eligible = qrOrdersRaw.filter((o) => isQrFeeEligibleForTotals(o));

    return {
        year,
        monthIndex0,
        label,
        scansCount,
        qrOrdersCount: eligible.length,
        qrFeesCents: eligible.reduce((s, o) => s + (o.referralFeeCents || 0), 0),
        coordinationFeesCents: coordinationAgg._sum.coordinationFeeCents || 0,
        orders: eligible.map((o) => ({
            orderNumber: o.orderNumber || '—',
            createdAt: o.createdAt.toISOString(),
            totalPriceCents: o.totalPriceCents,
            referralFeeCents: o.referralFeeCents,
            status: o.status,
        })),
    } satisfies FloristQrNetworkMonthSummary;
}

export async function loadFloristQrNetworkPayload(partnerId: string): Promise<FloristQrNetworkPayload | null> {
    const partner = await prisma.partner.findFirst({
        where: { id: partnerId, deletedAt: null },
        select: {
            id: true,
            shopName: true,
            slug: true,
            networkRole: true,
            networkStatus: true,
            assignedRegion: true,
            assignedProvinces: true,
            preferredCities: true,
        },
    });
    if (!partner) return null;

    const { current, previous } = currentAndPreviousMonthRome();
    const [currentMonth, previousMonth] = await Promise.all([
        summarizeMonth(partner.id, current.year, current.monthIndex0, current.label),
        summarizeMonth(partner.id, previous.year, previous.monthIndex0, previous.label),
    ]);

    return {
        partnerId: partner.id,
        shopName: partner.shopName,
        slug: partner.slug,
        qrUrl: partner.slug ? floristPublicQrUrl(partner.slug) : null,
        networkRole: partner.networkRole,
        networkStatus: partner.networkStatus,
        assignedRegion: partner.assignedRegion,
        assignedProvinces: partner.assignedProvinces || [],
        preferredCities: partner.preferredCities || [],
        currentMonth,
        previousMonth,
    };
}

export { formatEuroFromCents };
