import type { OrderStatus, PartnerCommissionSettlementStatus, PaymentStatus, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { calculatePartnerCommissionCents } from '@/lib/pricing/calculatePartnerCommission';

export type PartnerCommissionOrderRow = {
    id: string;
    orderNumber: string | null;
    createdAt: Date;
    deliveryDate: Date | null;
    deceasedName: string;
    cemeteryName: string;
    cemeteryCity: string;
    totalPriceCents: number;
    partnerCommissionCents: number;
    partnerPaymentStatus: PaymentStatus;
    status: OrderStatus;
    partnerCommissionSettlementStatus: PartnerCommissionSettlementStatus;
};

export type PartnerCommissionSummary = {
    partnerId: string;
    totalOrders: number;
    totalSalesCents: number;
    totalCommissionCents: number;
    currentMonthCommissionCents: number;
    pendingCommissionCents: number;
    settledCommissionCents: number;
    orders: PartnerCommissionOrderRow[];
};

function currentMonthKey(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function orderMatchesPartner(partnerId: string): Prisma.OrderWhereInput {
    return {
        OR: [{ referralPartnerId: partnerId }, { agencyId: partnerId }],
    };
}

function commissionEligibleWhere(testModeActive?: boolean): Prisma.OrderWhereInput {
    return {
        ...visibleDashboardOrdersWhere(testModeActive),
        OR: [
            { partnerCommissionCents: { not: null } },
            { referralPartnerId: { not: null } },
            { agencyId: { not: null } },
        ],
    };
}

export type GlobalPartnerCommissionMetrics = {
    totalOrders: number;
    totalSalesCents: number;
    totalCommissionCents: number;
    currentMonthCommissionCents: number;
    pendingCommissionCents: number;
    settledCommissionCents: number;
    partnerCount: number;
    agencyCount: number;
};

/** Metriche aggregate B2B per dashboard finance / metrics API (query live, no cache). */
export async function getGlobalPartnerCommissionMetrics(
    testModeActive?: boolean
): Promise<GlobalPartnerCommissionMetrics> {
    const monthPrefix = currentMonthKey();
    const orders = await prisma.order.findMany({
        where: commissionEligibleWhere(testModeActive),
        select: {
            id: true,
            totalPriceCents: true,
            partnerCommissionCents: true,
            partnerCommissionSettlementStatus: true,
            referralPartnerId: true,
            agencyId: true,
            createdAt: true,
        },
    });

    const partnerIds = new Set<string>();
    const agencyIds = new Set<string>();
    let totalSalesCents = 0;
    let totalCommissionCents = 0;
    let currentMonthCommissionCents = 0;
    let pendingCommissionCents = 0;
    let settledCommissionCents = 0;

    for (const o of orders) {
        if (o.referralPartnerId) partnerIds.add(o.referralPartnerId);
        if (o.agencyId) agencyIds.add(o.agencyId);
        const fee = o.partnerCommissionCents ?? calculatePartnerCommissionCents(o.totalPriceCents);
        totalSalesCents += o.totalPriceCents;
        totalCommissionCents += fee;
        if (o.createdAt.toISOString().slice(0, 7) === monthPrefix) {
            currentMonthCommissionCents += fee;
        }
        if (o.partnerCommissionSettlementStatus === 'PENDING') {
            pendingCommissionCents += fee;
        } else if (o.partnerCommissionSettlementStatus === 'LIQUIDATO') {
            settledCommissionCents += fee;
        }
    }

    return {
        totalOrders: orders.length,
        totalSalesCents,
        totalCommissionCents,
        currentMonthCommissionCents,
        pendingCommissionCents,
        settledCommissionCents,
        partnerCount: partnerIds.size,
        agencyCount: agencyIds.size,
    };
}

export async function getPartnerCommissionSummary(
    partnerId: string,
    testModeActive?: boolean
): Promise<PartnerCommissionSummary | null> {
    const partner = await prisma.partner.findFirst({
        where: { id: partnerId, deletedAt: null },
        select: { id: true, partnerType: true },
    });
    if (!partner) return null;

    const monthPrefix = currentMonthKey();
    const orders = await prisma.order.findMany({
        where: {
            ...visibleDashboardOrdersWhere(testModeActive),
            ...orderMatchesPartner(partnerId),
        },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            deliveryDate: true,
            deceasedName: true,
            cemeteryName: true,
            cemeteryCity: true,
            totalPriceCents: true,
            partnerCommissionCents: true,
            partnerPaymentStatus: true,
            status: true,
            partnerCommissionSettlementStatus: true,
        },
        orderBy: [{ createdAt: 'desc' }],
    });

    const rows: PartnerCommissionOrderRow[] = orders.map((o) => ({
        ...o,
        partnerCommissionCents:
            o.partnerCommissionCents ?? calculatePartnerCommissionCents(o.totalPriceCents),
    }));

    const totalSalesCents = rows.reduce((s, o) => s + o.totalPriceCents, 0);
    const totalCommissionCents = rows.reduce((s, o) => s + o.partnerCommissionCents, 0);
    const currentMonthCommissionCents = rows
        .filter((o) => o.createdAt.toISOString().slice(0, 7) === monthPrefix)
        .reduce((s, o) => s + o.partnerCommissionCents, 0);
    const pendingCommissionCents = rows
        .filter((o) => o.partnerCommissionSettlementStatus === 'PENDING')
        .reduce((s, o) => s + o.partnerCommissionCents, 0);
    const settledCommissionCents = rows
        .filter((o) => o.partnerCommissionSettlementStatus === 'LIQUIDATO')
        .reduce((s, o) => s + o.partnerCommissionCents, 0);

    return {
        partnerId,
        totalOrders: rows.length,
        totalSalesCents,
        totalCommissionCents,
        currentMonthCommissionCents,
        pendingCommissionCents,
        settledCommissionCents,
        orders: rows,
    };
}

export async function settlePartnerCommissionOrders(input: {
    partnerId: string;
    orderIds?: string[];
    periodKey?: string;
}): Promise<{ updated: number }> {
    const where: Prisma.OrderWhereInput = {
        ...orderMatchesPartner(input.partnerId),
        partnerCommissionSettlementStatus: 'PENDING',
        partnerPaymentStatus: 'PAID',
        deletedAt: null,
    };

    if (input.orderIds?.length) {
        where.id = { in: input.orderIds };
    } else if (input.periodKey?.trim()) {
        const [y, m] = input.periodKey.split('-').map(Number);
        if (y && m) {
            const start = new Date(y, m - 1, 1);
            const end = new Date(y, m, 1);
            where.createdAt = { gte: start, lt: end };
        }
    }

    const result = await prisma.order.updateMany({
        where,
        data: { partnerCommissionSettlementStatus: 'LIQUIDATO' },
    });

    return { updated: result.count };
}
