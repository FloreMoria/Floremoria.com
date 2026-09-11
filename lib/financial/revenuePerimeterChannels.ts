/**
 * C11 — insiemi orderId per canale ricavi (anno solare).
 * Le differenze di data cassa/competenza non entrano: solo membership.
 */
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import { REVENUE_ACTIVE_ORDER_STATUSES } from '@/lib/financial/officialRevenue2026';

export type PerimeterChannelId =
    | 'corrispettivi'
    | 'ledger'
    | 'taxRegister'
    | 'taxQuarterly'
    | 'cfoTools';

export type PerimeterChannelSet = {
    id: PerimeterChannelId;
    label: string;
    orderIds: string[];
};

export type PerimeterDivergence = {
    orderId: string;
    orderNumber: string | null;
    presentIn: PerimeterChannelId[];
    absentFrom: PerimeterChannelId[];
};

function yearBounds(year: number): { start: Date; end: Date } {
    return {
        start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
        end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    };
}

function orderRevenueWhere(start: Date, end: Date): Prisma.OrderWhereInput {
    return {
        deletedAt: null,
        isTest: false,
        createdAt: { gte: start, lte: end },
        status: { notIn: ['CANCELLED', 'PENDING'] },
        OR: [
            { grossAmount: { not: null } },
            { stripeTransactionId: { not: null } },
            { status: { in: [...REVENUE_ACTIVE_ORDER_STATUSES] } },
        ],
    };
}

const POSE_SELECT = {
    id: true,
    orderNumber: true,
    isRecurring: true,
    stripeTransactionId: true,
    grossAmount: true,
    netAmount: true,
    stripeFee: true,
    paymentMethodLabel: true,
    additionalInstructions: true,
    financeNotes: true,
} as const;

async function loadYearNonPoseOrders(year: number) {
    const { start, end } = yearBounds(year);
    const orders = await prisma.order.findMany({
        where: orderRevenueWhere(start, end),
        select: POSE_SELECT,
    });
    return orders.filter((o) => !isPrepaidSubscriptionPoseOrder(o));
}

async function resolveLedgerOrderIds(year: number): Promise<string[]> {
    const ledgerRows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            category: 'RICAVI_VENDITE',
            fiscalYear: year,
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
            NOT: { sourceType: 'CUSTOMER_RECEIPT' },
        },
        select: { orderId: true, documentRef: true },
        take: 20000,
    });
    const docs = [
        ...new Set(ledgerRows.map((r) => (r.documentRef || '').trim()).filter(Boolean)),
    ];
    const direct = [
        ...new Set(ledgerRows.map((r) => r.orderId).filter((id): id is string => Boolean(id))),
    ];
    const [byNumber, byId] = await Promise.all([
        docs.length
            ? prisma.order.findMany({
                  where: {
                      OR: docs.map((n) => ({
                          orderNumber: { equals: n, mode: 'insensitive' as const },
                      })),
                  },
                  select: POSE_SELECT,
              })
            : Promise.resolve([]),
        direct.length
            ? prisma.order.findMany({
                  where: { id: { in: direct } },
                  select: POSE_SELECT,
              })
            : Promise.resolve([]),
    ]);
    const map = new Map<string, (typeof byId)[number]>();
    for (const o of [...byNumber, byId].flat()) map.set(o.id, o);
    return [...map.values()]
        .filter((o) => !isPrepaidSubscriptionPoseOrder(o))
        .map((o) => o.id);
}

/**
 * Corrispettivi: ordini del 2026 con evidenza gateway (TX sull’ordine o movimento collegato),
 * indipendentemente dalla data del movimento — la cassa vs competenza non entra in C11.
 */
async function resolveCorrispettiviOrderIds(
    yearOrders: Array<{ id: string; stripeTransactionId: string | null }>
): Promise<string[]> {
    const yearIds = yearOrders.map((o) => o.id);
    if (yearIds.length === 0) return [];

    const withTx = new Set(
        yearOrders.filter((o) => o.stripeTransactionId?.trim()).map((o) => o.id)
    );

    const linked = await prisma.stripeFinanceMovement.findMany({
        where: { orderId: { in: yearIds } },
        select: { orderId: true },
        distinct: ['orderId'],
    });
    for (const m of linked) {
        if (m.orderId) withTx.add(m.orderId);
    }

    // PayPal / ledger gateway con orderId
    const paypalLinked = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            orderId: { in: yearIds },
            OR: [
                { sourceType: 'PAYPAL_MOVEMENT' },
                { sourceKey: { startsWith: 'PAYPAL_' } },
            ],
        },
        select: { orderId: true },
        distinct: ['orderId'],
    });
    for (const r of paypalLinked) {
        if (r.orderId) withTx.add(r.orderId);
    }

    return [...withTx].sort();
}

/**
 * Cinque insiemi orderId sull’anno solare (pose escluse).
 * taxRegister / taxQuarterly / cfoTools = stesso predicato ordini anno.
 */
export async function measureRevenuePerimeterSets(
    year: number
): Promise<PerimeterChannelSet[]> {
    const yearOrders = await loadYearNonPoseOrders(year);
    const baseIds = yearOrders.map((o) => o.id).sort();

    const [corrIds, ledgerIds] = await Promise.all([
        resolveCorrispettiviOrderIds(yearOrders),
        resolveLedgerOrderIds(year),
    ]);

    // Solo ordini dell’anno nel ledger (evita docRef di altri esercizi)
    const baseSet = new Set(baseIds);
    const ledgerInYear = ledgerIds.filter((id) => baseSet.has(id)).sort();
    const corrInYear = corrIds.filter((id) => baseSet.has(id)).sort();

    return [
        { id: 'corrispettivi', label: 'Corrispettivi', orderIds: corrInYear },
        { id: 'ledger', label: 'Ledger ricavi', orderIds: ledgerInYear },
        { id: 'taxRegister', label: 'taxRegister', orderIds: baseIds },
        { id: 'taxQuarterly', label: 'taxQuarterly', orderIds: [...baseIds] },
        { id: 'cfoTools', label: 'cfoTools', orderIds: [...baseIds] },
    ];
}

export function diffPerimeterSets(channels: PerimeterChannelSet[]): {
    divergentCount: number;
    divergences: PerimeterDivergence[];
    channelSizes: Record<string, number>;
} {
    const ids = channels.map((c) => c.id);
    const sets = channels.map((c) => new Set(c.orderIds));
    const union = new Set<string>();
    for (const s of sets) for (const id of s) union.add(id);

    let intersection = new Set(union);
    for (const s of sets) {
        intersection = new Set([...intersection].filter((id) => s.has(id)));
    }

    const divergentIds = [...union].filter((id) => !intersection.has(id)).sort();
    const divergences: PerimeterDivergence[] = divergentIds.map((orderId) => {
        const presentIn: PerimeterChannelId[] = [];
        const absentFrom: PerimeterChannelId[] = [];
        channels.forEach((ch, i) => {
            if (sets[i]!.has(orderId)) presentIn.push(ch.id);
            else absentFrom.push(ch.id);
        });
        return { orderId, orderNumber: null, presentIn, absentFrom };
    });

    const channelSizes = Object.fromEntries(
        channels.map((c) => [c.id, c.orderIds.length])
    );

    return {
        divergentCount: divergences.length,
        divergences,
        channelSizes,
    };
}

/** Arricchisce orderNumber per il dettaglio C11. */
export async function enrichDivergences(
    divergences: PerimeterDivergence[]
): Promise<PerimeterDivergence[]> {
    if (divergences.length === 0) return divergences;
    const orders = await prisma.order.findMany({
        where: { id: { in: divergences.map((d) => d.orderId) } },
        select: { id: true, orderNumber: true },
    });
    const map = new Map(orders.map((o) => [o.id, o.orderNumber]));
    return divergences.map((d) => ({
        ...d,
        orderNumber: map.get(d.orderId) || null,
    }));
}

/** @deprecated usa measureRevenuePerimeterSets */
export async function measureRevenuePerimeterChannels(
    year: number,
    _quarter?: number
): Promise<Array<PerimeterChannelSet & { grossCents: number }>> {
    const sets = await measureRevenuePerimeterSets(year);
    return sets.map((s) => ({ ...s, grossCents: 0 }));
}
