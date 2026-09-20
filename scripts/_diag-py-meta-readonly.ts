import fs from 'node:fs';
import prisma from '@/lib/prisma';

const ids = [
    'py_3TZBBT4W4pZWhSUs1wFm0e3s',
    'py_3TZBFq4W4pZWhSUs13kgc1OA',
    'py_3TjJBK4W4pZWhSUs1mfvQoPS',
];

async function main() {
    const rows = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: ids.flatMap((id) => [
                { sourceId: id },
                { stripeId: { contains: id.slice(3, 20) } },
            ]),
        },
        select: {
            stripeId: true,
            sourceId: true,
            type: true,
            amountCents: true,
            createdAtStripe: true,
            reportingCategory: true,
            description: true,
            metadataJson: true,
            orderId: true,
        },
    });

    const out = rows.map((r) => {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        return {
            stripeId: r.stripeId,
            sourceId: r.sourceId,
            type: r.type,
            amountCents: r.amountCents,
            date: r.createdAtStripe.toISOString(),
            orderId: r.orderId,
            metaKeys: Object.keys(meta),
            metaSample: {
                charge: meta.charge,
                latest_charge: meta.latest_charge,
                payment_intent: meta.payment_intent,
                paymentIntentId: meta.paymentIntentId,
                balance_transaction: meta.balance_transaction,
                source: meta.source,
                rawStripeId: meta.rawStripeId,
                account: meta.account,
            },
        };
    });

    const may20Orders = await prisma.order.count({
        where: {
            deletedAt: null,
            isTest: false,
            totalPriceCents: 3148,
            createdAt: { gte: new Date('2026-05-20'), lt: new Date('2026-05-21') },
        },
    });
    const may20PyDistinct = await prisma.stripeFinanceMovement.findMany({
        where: {
            type: 'payment',
            amountCents: 3148,
            createdAtStripe: {
                gte: new Date('2026-05-20'),
                lt: new Date('2026-05-21'),
            },
        },
        select: { sourceId: true, stripeId: true },
    });
    const distinct = [...new Set(may20PyDistinct.map((m) => m.sourceId).filter(Boolean))];

    // All charges on those dates any amount - maybe different reporting
    const chargesMay20 = await prisma.stripeFinanceMovement.findMany({
        where: {
            type: 'charge',
            createdAtStripe: {
                gte: new Date('2026-05-20'),
                lt: new Date('2026-05-21'),
            },
        },
        select: {
            sourceId: true,
            amountCents: true,
            stripeId: true,
            reportingCategory: true,
        },
        take: 50,
    });

    fs.writeFileSync(
        '/tmp/py-meta.json',
        JSON.stringify(
            { rows: out, may20Orders, may20DistinctPy: distinct, chargesMay20 },
            null,
            2
        )
    );
    console.error('ok');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
