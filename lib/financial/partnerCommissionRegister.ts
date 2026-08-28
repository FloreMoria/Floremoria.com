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
            partnerPaymentStatus: 'PAID',
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
