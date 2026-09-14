/**
 * Diagnosi sola lettura — carnet Isabella Cesaroni / pose pagate.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import prisma from '@/lib/prisma';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';

function euro(c: number) {
    return (c / 100).toFixed(2);
}

async function main() {
    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { buyerEmail: { equals: 'isa.cesaroni@gmail.com', mode: 'insensitive' } },
                { buyerFullName: { contains: 'Cesaroni', mode: 'insensitive' } },
                { deceasedName: { contains: 'Rumori', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            deletedAt: true,
            totalPriceCents: true,
            partnerPaymentStatus: true,
            status: true,
            isRecurring: true,
            paymentMethodLabel: true,
            stripeTransactionId: true,
            buyerFullName: true,
            buyerEmail: true,
            deceasedName: true,
            cemeteryName: true,
            cemeteryCity: true,
            financeNotes: true,
            additionalInstructions: true,
            items: {
                select: {
                    quantity: true,
                    priceCents: true,
                    product: { select: { name: true, vatRatePercent: true, basePriceCents: true } },
                },
            },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
    });

    const poses = orders.map((o) => {
        const pose = isPrepaidSubscriptionPoseOrder(o);
        return {
            id: o.id.slice(0, 10),
            orderNumber: o.orderNumber,
            date: o.createdAt.toISOString().slice(0, 10),
            deleted: Boolean(o.deletedAt),
            totalEuro: euro(o.totalPriceCents),
            partnerPaymentStatus: o.partnerPaymentStatus,
            status: o.status,
            isRecurring: o.isRecurring,
            stripeTx: o.stripeTransactionId,
            paymentLabel: o.paymentMethodLabel,
            deceased: o.deceasedName,
            cemetery: `${o.cemeteryName || ''} ${o.cemeteryCity || ''}`.trim(),
            isPoseExcludedFromRevenue: pose,
            items: o.items.map(
                (it) =>
                    `${it.quantity}× ${it.product?.name || '?'} @${euro(it.priceCents)} vat=${it.product?.vatRatePercent}`
            ),
        };
    });

    const activePaidPoses = orders.filter(
        (o) =>
            !o.deletedAt &&
            o.partnerPaymentStatus === 'PAID' &&
            isPrepaidSubscriptionPoseOrder(o)
    );
    const activePaidPoseCents = activePaidPoses.reduce((s, o) => s + o.totalPriceCents, 0);

    // Stripe 284.90
    const stripe = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [
                { amountCents: 28490 },
                { stripeId: { contains: '3TSzMs' } },
                { sourceId: { contains: '3TSzMs' } },
            ],
        },
        select: {
            stripeId: true,
            sourceId: true,
            amountCents: true,
            type: true,
            createdAtStripe: true,
            orderId: true,
            metadataJson: true,
        },
        take: 10,
    });

    // General: recurring PAID without stripe TX (pose pattern)
    const allPoses = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isRecurring: true,
            partnerPaymentStatus: 'PAID',
            OR: [{ stripeTransactionId: null }, { stripeTransactionId: '' }],
        },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            totalPriceCents: true,
            buyerFullName: true,
            buyerEmail: true,
            isRecurring: true,
            stripeTransactionId: true,
            partnerPaymentStatus: true,
        },
        take: 500,
    });
    const poseLike = allPoses.filter((o) => isPrepaidSubscriptionPoseOrder(o));
    const byBuyer = new Map<string, { n: number; cents: number; samples: string[] }>();
    for (const o of poseLike) {
        const k = (o.buyerEmail || o.buyerFullName || 'unknown').toLowerCase();
        const g = byBuyer.get(k) || { n: 0, cents: 0, samples: [] };
        g.n += 1;
        g.cents += o.totalPriceCents;
        if (g.samples.length < 3) g.samples.push(`${o.orderNumber || o.id.slice(0, 8)} ${euro(o.totalPriceCents)}`);
        byBuyer.set(k, g);
    }

    // Do poses appear in gateway corrispettivi / ledger?
    const poseIds = activePaidPoses.map((o) => o.id);
    const ledgerHits =
        poseIds.length > 0
            ? await prisma.financialLedgerEntry.findMany({
                  where: { orderId: { in: poseIds }, reversedAt: null },
                  select: { orderId: true, totalCents: true, sourceType: true, sourceKey: true },
                  take: 100,
              })
            : [];

    // Check if any pose totals match unmatched gateway amounts
    const { start: t2s, end: t2e } = {
        start: new Date(Date.UTC(2026, 3, 1)),
        end: new Date(Date.UTC(2026, 5, 30, 23, 59, 59, 999)),
    };
    const { start: t3s, end: t3e } = {
        start: new Date(Date.UTC(2026, 6, 1)),
        end: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)),
    };
    const [t2, t3] = await Promise.all([
        buildGatewayCorrispettivi({ start: t2s, end: t2e }),
        buildGatewayCorrispettivi({ start: t3s, end: t3e }),
    ]);
    const poseAmounts = new Set(activePaidPoses.map((o) => o.totalPriceCents));
    const t2MancanteNoOrder = t2.rows.filter((r) => r.vatCertainty === 'MANCANTE' && !r.orderId);
    const t3MancanteNoOrder = t3.rows.filter((r) => r.vatCertainty === 'MANCANTE' && !r.orderId);
    const overlapT2 = t2MancanteNoOrder.filter((r) => poseAmounts.has(Math.abs(r.grossCents)));
    const overlapT3 = t3MancanteNoOrder.filter((r) => poseAmounts.has(Math.abs(r.grossCents)));

    // Carnet progress: is there a parent subscription / remaining count?
    const products = await prisma.product.findMany({
        where: { name: { contains: 'carnet', mode: 'insensitive' } },
        select: { id: true, name: true, basePriceCents: true, vatRatePercent: true },
    });

    console.log(
        JSON.stringify(
            {
                isabellaOrders: poses,
                activePaidPoses: {
                    n: activePaidPoses.length,
                    totalEuro: euro(activePaidPoseCents),
                    unitEuroSample: activePaidPoses[0]
                        ? euro(activePaidPoses[0].totalPriceCents)
                        : null,
                },
                stripe28490: stripe.map((s) => ({
                    id: s.stripeId,
                    amount: euro(s.amountCents),
                    type: s.type,
                    date: s.createdAtStripe.toISOString().slice(0, 10),
                    orderId: s.orderId,
                })),
                ledgerOnPoses: ledgerHits.length,
                generalPosePattern: {
                    nOrders: poseLike.length,
                    totalEuro: euro(poseLike.reduce((s, o) => s + o.totalPriceCents, 0)),
                    distinctBuyers: byBuyer.size,
                    buyers: [...byBuyer.entries()]
                        .sort((a, b) => b[1].n - a[1].n)
                        .slice(0, 15)
                        .map(([k, v]) => ({
                            buyer: k,
                            n: v.n,
                            euro: euro(v.cents),
                            samples: v.samples,
                        })),
                },
                overlapWithMancanteNoOrder: {
                    t2MancanteNoOrder: t2MancanteNoOrder.length,
                    t3MancanteNoOrder: t3MancanteNoOrder.length,
                    t2AmountOverlapWithPosePrices: overlapT2.length,
                    t3AmountOverlapWithPosePrices: overlapT3.length,
                    note: 'Overlap is by amount only, not identity — poses typically have no gateway TX',
                },
                carnetProducts: products,
            },
            null,
            2
        )
    );
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
