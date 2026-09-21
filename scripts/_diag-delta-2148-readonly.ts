/**
 * Delta €21,48: lista 83/€4398.64 vs corrispettivi 78/€4377.16
 */
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

async function main() {
    const all = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            createdAt: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            status: true,
            createdAt: true,
            isRecurring: true,
            stripeTransactionId: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            paymentMethodLabel: true,
            additionalInstructions: true,
            financeNotes: true,
            deliveryDate: true,
        },
        take: 5000,
    });

    const notCancelled = all.filter(
        (o) => !/CANCEL|REFUND|ANNULL/i.test(o.status || '')
    );
    const sumAll = notCancelled.reduce((s, o) => s + (o.totalPriceCents || 0), 0);
    console.log('notCancelled', notCancelled.length, (sumAll / 100).toFixed(2));

    const poses = notCancelled.filter((o) => isPrepaidSubscriptionPoseOrder(o));
    const withPrice = notCancelled.filter((o) => (o.totalPriceCents || 0) > 0);
    const zero = notCancelled.filter((o) => (o.totalPriceCents || 0) === 0);

    console.log('withPrice', withPrice.length, (withPrice.reduce((s, o) => s + o.totalPriceCents, 0) / 100).toFixed(2));
    console.log('zero', zero.length, zero.map((o) => o.orderNumber || o.id.slice(0, 8)));
    console.log('poses', poses.length, poses.map((o) => ({ n: o.orderNumber, c: o.totalPriceCents })));

    // Gateway
    const gw: Array<{
        orderNumber: string;
        date: string;
        grossCents: number;
        tx: string;
        q: number;
    }> = [];
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(2026, q);
        if (b.start > new Date()) continue;
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            gw.push({
                orderNumber: r.orderNumber || 'DA_COLLEGARE',
                date: r.date,
                grossCents: r.grossCents,
                tx: r.transactionId,
                q,
            });
        }
    }
    const gwSum = gw.reduce((s, r) => s + r.grossCents, 0);
    console.log('gw', gw.length, (gwSum / 100).toFixed(2));
    console.log('delta439864-gw', ((439864 - gwSum) / 100).toFixed(2));
    console.log('deltaSumAll-gw', ((sumAll - gwSum) / 100).toFixed(2));

    // Find orders whose total is not represented in gateway multiset
    const gwPool = gw.map((g) => ({ ...g, used: false }));
    const unmatchedOrders: typeof withPrice = [];
    for (const o of withPrice) {
        const byNum = gwPool.find(
            (g) =>
                !g.used &&
                g.orderNumber &&
                o.orderNumber &&
                g.orderNumber.toUpperCase() === o.orderNumber.toUpperCase()
        );
        if (byNum) {
            byNum.used = true;
            continue;
        }
        const byAmt = gwPool.find((g) => !g.used && g.grossCents === o.totalPriceCents);
        if (byAmt) {
            byAmt.used = true;
            continue;
        }
        unmatchedOrders.push(o);
    }
    const unmatchedGw = gwPool.filter((g) => !g.used);

    console.log(
        'ordersWithoutGwMatch',
        unmatchedOrders.length,
        unmatchedOrders.map((o) => ({
            n: o.orderNumber,
            euro: (o.totalPriceCents / 100).toFixed(2),
            status: o.status,
            date: o.createdAt.toISOString().slice(0, 10),
        }))
    );
    console.log(
        'gwWithoutOrderMatch',
        unmatchedGw.length,
        unmatchedGw.map((g) => ({
            n: g.orderNumber,
            euro: (g.grossCents / 100).toFixed(2),
            date: g.date,
            tx: g.tx.slice(0, 28),
        }))
    );

    // Specific 21.48
    const target = 2148;
    console.log(
        'orders exactly 21.48',
        withPrice.filter((o) => o.totalPriceCents === target)
    );
    // combinations of unmatched that sum to 21.48
    const uSum = unmatchedOrders.reduce((s, o) => s + o.totalPriceCents, 0);
    const gSum = unmatchedGw.reduce((s, g) => s + g.grossCents, 0);
    console.log('unmatchedOrdersSum', (uSum / 100).toFixed(2), 'unmatchedGwSum', (gSum / 100).toFixed(2), 'net', ((uSum - gSum) / 100).toFixed(2));

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
