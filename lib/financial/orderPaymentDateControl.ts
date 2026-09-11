/**
 * C12 — data ordine = data incasso cliente (±24h fuso).
 */
import prisma from '@/lib/prisma';

const MS_24H = 24 * 60 * 60 * 1000;

export type OrderPaymentDateDivergence = {
    orderId: string;
    orderNumber: string | null;
    orderDate: string;
    paymentDate: string;
    gateway: 'stripe' | 'paypal';
    absDiffHours: number;
};

function toIsoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Confronta createdAt ordine con data movimento gateway collegato.
 * Tolleranza dichiarata: |Δ| ≤ 24h (fuso) → non errore.
 */
export async function findOrderPaymentDateDivergences(year: number): Promise<{
    checked: number;
    timezoneToleranceHours: 24;
    divergences: OrderPaymentDateDivergence[];
}> {
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: start, lte: end },
            OR: [
                { stripeTransactionId: { not: null } },
                { paymentMethodLabel: { not: null } },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            stripeTransactionId: true,
        },
    });

    const orderIds = orders.map((o) => o.id);
    const txIds = orders
        .map((o) => o.stripeTransactionId)
        .filter((t): t is string => Boolean(t?.trim()));

    const [byOrderId, byStripeId, paypalRows] = await Promise.all([
        orderIds.length
            ? prisma.stripeFinanceMovement.findMany({
                  where: {
                      orderId: { in: orderIds },
                      type: { in: ['charge', 'payment'] },
                  },
                  select: {
                      orderId: true,
                      stripeId: true,
                      createdAtStripe: true,
                      amountCents: true,
                  },
                  orderBy: { createdAtStripe: 'asc' },
              })
            : Promise.resolve([]),
        txIds.length
            ? prisma.stripeFinanceMovement.findMany({
                  where: {
                      stripeId: { in: txIds },
                      type: { in: ['charge', 'payment'] },
                  },
                  select: {
                      orderId: true,
                      stripeId: true,
                      createdAtStripe: true,
                      amountCents: true,
                  },
              })
            : Promise.resolve([]),
        orderIds.length
            ? prisma.financialLedgerEntry.findMany({
                  where: {
                      reversedAt: null,
                      orderId: { in: orderIds },
                      OR: [
                          { sourceType: 'PAYPAL_MOVEMENT' },
                          { sourceKey: { startsWith: 'PAYPAL_' } },
                      ],
                  },
                  select: {
                      orderId: true,
                      accountingDate: true,
                      totalCents: true,
                      direction: true,
                  },
              })
            : Promise.resolve([]),
    ]);

    const stripeByOrder = new Map<string, Date>();
    for (const m of [...byOrderId, ...byStripeId]) {
        if (!m.createdAtStripe) continue;
        const oid =
            m.orderId ||
            orders.find((o) => o.stripeTransactionId === m.stripeId)?.id;
        if (!oid) continue;
        const prev = stripeByOrder.get(oid);
        if (!prev || m.createdAtStripe < prev) stripeByOrder.set(oid, m.createdAtStripe);
    }

    const paypalByOrder = new Map<string, Date>();
    for (const r of paypalRows) {
        if (!r.orderId || !r.accountingDate) continue;
        if (r.totalCents < 0 && r.direction === 'USCITA') continue;
        const prev = paypalByOrder.get(r.orderId);
        if (!prev || r.accountingDate < prev) {
            paypalByOrder.set(r.orderId, r.accountingDate);
        }
    }

    const divergences: OrderPaymentDateDivergence[] = [];
    let checked = 0;

    for (const o of orders) {
        const payDate = stripeByOrder.get(o.id) || paypalByOrder.get(o.id);
        if (!payDate) continue;
        checked += 1;
        const absDiff = Math.abs(o.createdAt.getTime() - payDate.getTime());
        if (absDiff <= MS_24H) continue;
        divergences.push({
            orderId: o.id,
            orderNumber: o.orderNumber,
            orderDate: toIsoDay(o.createdAt),
            paymentDate: toIsoDay(payDate),
            gateway: stripeByOrder.has(o.id) ? 'stripe' : 'paypal',
            absDiffHours: Math.round((absDiff / (60 * 60 * 1000)) * 10) / 10,
        });
    }

    divergences.sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    return { checked, timezoneToleranceHours: 24, divergences };
}
