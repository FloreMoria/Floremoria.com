import prisma from '@/lib/prisma';
import {
    isCoordinationFeeEligibleForTotals,
    resolveCoordinationFeeStatus,
} from '@/lib/floristNetwork/colleagueDelegation';
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
    createdAt: string;
    totalPriceCents: number;
    referralFeeCents: number;
    orderStatus: string;
    feeStatusLabel: string;
    /** true = conteggiato nei totali mese (Art. 3.3). */
    inTotals: boolean;
    delegatedToColleague: boolean;
    coordinationFeeCents: number;
};

export type FloristDelegatedOrderRow = {
    orderNumber: string;
    /** ISO data consegna (o null se assente). */
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
    qrFeesCents: number;
    /**
     * Somma fee coordinamento eleggibili nel mese (bucket = deliveryDate).
     * Prima di questo fix il KPI usava createdAt + NOT IN su cancellationCause
     * (che in SQL escludeva anche i null → totali a 0).
     */
    coordinationFeesCents: number;
    /** Fee QR + coordinamento (solo eleggibili) per il mese. */
    combinedFeesCents: number;
    /** Tutti gli ordini QR del mese (inclusi esclusi), per tracciabilità. */
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
    /**
     * Tutti gli ordini con coordinatorFloristId = Leader (nessun PII cliente).
     * Ordinati per deliveryDate desc.
     */
    delegatedOrders: FloristDelegatedOrderRow[];
};

async function loadDelegatedOrders(partnerId: string): Promise<FloristDelegatedOrderRow[]> {
    const rows = await prisma.order.findMany({
        where: {
            coordinatorFloristId: partnerId,
            // Soft-deleted inclusi in elenco (marcati esclusi) per audit.
        },
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

    const [scansCount, qrOrdersRaw, coordinationRaw] = await Promise.all([
        prisma.floristScanEvent.count({
            where: { floristId: partnerId, createdAt: { gte: start, lt: end } },
        }),
        prisma.order.findMany({
            where: {
                referralFloristId: partnerId,
                createdAt: { gte: start, lt: end },
                // Soft-deleted inclusi: tracciabilità fee QR (restano fuori totali via isQrFeeEligibleForTotals).
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
            },
        }),
        // Coordinamento: mese della CONSEGNA (quello che il fiorista fattura).
        // Prima: createdAt — e aggregate NOT IN escludeva cancellationCause null.
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

    // Totali Art. 3.3: solo eleggibili. Elenco: tutti (test/annullati restano tracciabili).
    const eligible = qrOrdersRaw.filter((o) => isQrFeeEligibleForTotals(o));
    const qrFeesCents = eligible.reduce((s, o) => s + (o.referralFeeCents || 0), 0);
    const coordinationFeesCents = coordinationRaw
        .filter((o) => isCoordinationFeeEligibleForTotals(o))
        .reduce((s, o) => s + (o.coordinationFeeCents || 0), 0);

    return {
        year,
        monthIndex0,
        label,
        scansCount,
        qrOrdersCount: eligible.length,
        qrFeesCents,
        coordinationFeesCents,
        combinedFeesCents: qrFeesCents + coordinationFeesCents,
        orders: qrOrdersRaw.map((o) => {
            const fee = resolveQrFeeStatus(o);
            return {
                orderNumber: o.orderNumber || '—',
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

export { formatEuroFromCents };
