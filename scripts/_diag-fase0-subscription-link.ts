import fs from 'node:fs';
import prisma from '@/lib/prisma';

const pyIds = [
    'py_3TZBBT4W4pZWhSUs1wFm0e3s',
    'py_3TZBFq4W4pZWhSUs13kgc1OA',
    'py_3TjJBK4W4pZWhSUs1mfvQoPS',
    'py_3TjJKX4W4pZWhSUs0BjNn3RV',
    'py_3TpPFc4W4pZWhSUs0s0z7zvu',
    'py_3TpPJU4W4pZWhSUs1N3Am5Ht',
    'py_3TyuIF4W4pZWhSUs01ynUG53',
    'py_3TyuTV4W4pZWhSUs00PZNqwe',
    'py_3U5QyD4W4pZWhSUs1Lgk1VNp',
    'py_3U5R2d4W4pZWhSUs0IA5ZBux',
];

async function main() {
    const moves = await prisma.stripeFinanceMovement.findMany({
        where: { OR: pyIds.map((id) => ({ sourceId: id })) },
        select: {
            sourceId: true,
            stripeId: true,
            type: true,
            amountCents: true,
            createdAtStripe: true,
            orderId: true,
            metadataJson: true,
            description: true,
            reportingCategory: true,
        },
    });

    const allMeta = moves.map((m) => ({
        sourceId: m.sourceId,
        stripeId: m.stripeId,
        type: m.type,
        amount: m.amountCents,
        date: m.createdAtStripe.toISOString().slice(0, 10),
        orderId: m.orderId,
        description: m.description,
        reportingCategory: m.reportingCategory,
        meta: m.metadataJson,
        metaKeys:
            m.metadataJson && typeof m.metadataJson === 'object'
                ? Object.keys(m.metadataJson as object)
                : [],
    }));

    const sampleOrders = await prisma.order.findMany({
        where: { totalPriceCents: 3148, deletedAt: null, isTest: false },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            isRecurring: true,
            stripeTransactionId: true,
            additionalInstructions: true,
            financeNotes: true,
            veraWorkflowFlags: true,
            buyerEmail: true,
            customerPhone: true,
            deceasedName: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
    });

    // Group orders by email to see two recurring clients
    const byEmail = new Map<string, typeof sampleOrders>();
    for (const o of sampleOrders) {
        const k = (o.buyerEmail || o.customerPhone || o.deceasedName || 'unknown').toLowerCase();
        const list = byEmail.get(k) || [];
        list.push(o);
        byEmail.set(k, list);
    }

    fs.writeFileSync(
        '/tmp/fase0.json',
        JSON.stringify(
            {
                allMeta,
                sampleOrders,
                byEmail: [...byEmail.entries()].map(([k, v]) => ({
                    key: k,
                    count: v.length,
                    orders: v.map((o) => ({
                        orderNumber: o.orderNumber,
                        date: o.createdAt.toISOString().slice(0, 10),
                        isRecurring: o.isRecurring,
                        stripeTransactionId: o.stripeTransactionId,
                        flags: o.veraWorkflowFlags,
                        notes: o.additionalInstructions,
                    })),
                })),
            },
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
