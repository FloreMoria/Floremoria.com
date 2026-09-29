import prisma from '@/lib/prisma';
import {
    isCoordinationFeeEligibleForTotals,
    resolveCoordinationFeeStatus,
} from '@/lib/floristNetwork/colleagueDelegation';
import {
    isDateInBounds,
    resolveOrderDeliveryAt,
    resolveOrderPaymentAt,
} from '@/lib/floristNetwork/orderFeeDates';
import {
    currentAndPreviousMonthRome,
    floristPublicQrUrl,
    formatEuroFromCents,
    isQrFeeEligibleForTotals,
    monthBoundsUtc,
    resolveQrFeeStatus,
} from '@/lib/floristNetwork/qrAdminViews';

export type FloristQrNetworkOrderRow = {
    orderNumber: string;
    /** ISO data pagamento (bucket Fee QR). */
    paidAt: string | null;
    /** ISO createdAt (tracciabilità). */
    createdAt: string;
    totalPriceCents: number;
    referralFeeCents: number;
    orderStatus: string;
    feeStatusLabel: string;
    /** true = conteggiato nei totali mese (Art. 3.3 / 9). */
    inTotals: boolean;
    delegatedToColleague: boolean;
    coordinationFeeCents: number;
};

export type FloristDelegatedOrderRow = {
    orderNumber: string;
    deliveryDate: string | null;
    floristCompensationCents: number;
    coordinationFeeCents: number;
    orderStatus: string;
    statusLabel: string;
    inTotals: boolean;
};

export type FloristQrNetworkMonthSummary = {
    year: number;
    monthIndex0: number;
    label: string;
    scansCount: number;
    qrOrdersCount: number;
    /** Fee QR eleggibili — bucket mese PAGAMENTO. */
    qrFeesCents: number;
    /** Coordinamento eleggibile — bucket mese CONSEGNA. */
    coordinationFeesCents: number;
    /** Fee QR + coordinamento (eleggibili) del mese. */
    combinedFeesCents: number;
    /** Ordini QR con pagamento nel mese (inclusi esclusi dai totali). */
    orders: FloristQrNetworkOrderRow[];
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
    delegatedOrders: FloristDelegatedOrderRow[];
};

async function loadDelegatedOrders(partnerId: string): Promise<FloristDelegatedOrderRow[]> {
    const rows = await prisma.order.findMany({
        where: { coordinatorFloristId: partnerId },
        orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
        select: {
            orderNumber: true,
            deliveryDate: true,
            floristCompensationCents: true,
            coordinationFeeCents: true,
            status: true,
            isTest: true,
            cancellationCause: true,
            deletedAt: true,
        },
    });

    return rows.map((o) => {
        const st = resolveCoordinationFeeStatus(o);
        return {
            orderNumber: o.orderNumber || '—',
            deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString() : null,
            floristCompensationCents: o.floristCompensationCents || 0,
            coordinationFeeCents: o.coordinationFeeCents || 0,
            orderStatus: o.status,
            statusLabel: st.label,
            inTotals: st.inTotals && isCoordinationFeeEligibleForTotals(o),
        };
    });
}

async function summarizeMonth(partnerId: string, year: number, monthIndex0: number, label: string) {
    const { start, end } = monthBoundsUtc(year, monthIndex0);

    // Finestra ampia su createdAt per catturare pagamenti nel mese anche se
    // customerNotifyPaidAt ≠ createdAt (max ~45gg di scarto amministrativo).
    const qrFetchStart = new Date(start);
    qrFetchStart.setUTCDate(qrFetchStart.getUTCDate() - 45);
    const qrFetchEnd = new Date(end);
    qrFetchEnd.setUTCDate(qrFetchEnd.getUTCDate() + 7);

    const [scansCount, qrCandidates, coordinationCandidates] = await Promise.all([
        prisma.floristScanEvent.count({
            where: { floristId: partnerId, createdAt: { gte: start, lt: end } },
        }),
        prisma.order.findMany({
            where: {
                referralFloristId: partnerId,
                createdAt: { gte: qrFetchStart, lt: qrFetchEnd },
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
                coordinationFeeCents: true,
                coordinatorFloristId: true,
                partnerPaymentStatus: true,
                veraWorkflowFlags: true,
                paidAt: true,
            },
        }),
        // Coordinamento: mese CONSEGNA. Eleggibilità in JS (mai NOT IN su null).
        prisma.order.findMany({
            where: {
                coordinatorFloristId: partnerId,
                deliveryDate: { gte: start, lt: end },
            },
            select: {
                coordinationFeeCents: true,
                status: true,
                isTest: true,
                cancellationCause: true,
                deletedAt: true,
            },
        }),
    ]);

    const qrInMonth = qrCandidates
        .map((o) => {
            const paidAt = resolveOrderPaymentAt(o);
            return { o, paidAt };
        })
        .filter(({ paidAt }) => isDateInBounds(paidAt, start, end));

    const eligibleQr = qrInMonth.filter(({ o }) => isQrFeeEligibleForTotals(o));
    const qrFeesCents = eligibleQr.reduce((s, { o }) => s + (o.referralFeeCents || 0), 0);

    const coordinationFeesCents = coordinationCandidates
        .filter((o) => isCoordinationFeeEligibleForTotals(o))
        .reduce((s, o) => s + (o.coordinationFeeCents || 0), 0);

    return {
        year,
        monthIndex0,
        label,
        scansCount,
        qrOrdersCount: eligibleQr.length,
        qrFeesCents,
        coordinationFeesCents,
        combinedFeesCents: qrFeesCents + coordinationFeesCents,
        orders: qrInMonth.map(({ o, paidAt }) => {
            const fee = resolveQrFeeStatus(o);
            return {
                orderNumber: o.orderNumber || '—',
                paidAt: paidAt ? paidAt.toISOString() : null,
                createdAt: o.createdAt.toISOString(),
                totalPriceCents: o.totalPriceCents,
                referralFeeCents: o.referralFeeCents,
                orderStatus: o.status,
                feeStatusLabel: fee.label,
                inTotals: isQrFeeEligibleForTotals(o),
                delegatedToColleague: Boolean(
                    o.coordinatorFloristId && (o.coordinationFeeCents || 0) > 0
                ),
                coordinationFeeCents: o.coordinationFeeCents || 0,
            };
        }),
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
    const [currentMonth, previousMonth, delegatedOrders] = await Promise.all([
        summarizeMonth(partner.id, current.year, current.monthIndex0, current.label),
        summarizeMonth(partner.id, previous.year, previous.monthIndex0, previous.label),
        loadDelegatedOrders(partner.id),
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
        delegatedOrders,
    };
}

export { formatEuroFromCents, resolveOrderDeliveryAt, resolveOrderPaymentAt };
