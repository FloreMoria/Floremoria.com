import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}
import prisma from '@/lib/prisma';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import { buildTaxRegisterReport } from '@/lib/financial/taxRegister';

async function main() {
    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { buyerEmail: { equals: 'isa.cesaroni@gmail.com', mode: 'insensitive' } },
                { buyerFullName: { contains: 'Cesaroni', mode: 'insensitive' } },
                { orderNumber: { startsWith: 'FT-MC-26' } },
            ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            deletedAt: true,
            totalPriceCents: true,
            partnerPaymentStatus: true,
            status: true,
            isRecurring: true,
            stripeTransactionId: true,
            additionalInstructions: true,
            financeNotes: true,
            floristCompensationCents: true,
            floristSettlementStatus: true,
        },
    });
    for (const o of orders) {
        console.log(
            [
                o.orderNumber || 'null',
                o.createdAt.toISOString().slice(0, 10),
                o.deletedAt ? 'DEL' : 'act',
                o.partnerPaymentStatus,
                o.status,
                (o.totalPriceCents / 100).toFixed(2),
                o.isRecurring ? 'rec' : 'once',
                o.stripeTransactionId ? 'TX' : 'noTX',
                isPrepaidSubscriptionPoseOrder(o) ? 'POSE_exREV' : 'NOT_pose',
                `florComp=${((o.floristCompensationCents || 0) / 100).toFixed(2)}`,
                (o.additionalInstructions || '').slice(0, 70),
            ].join(' | ')
        );
    }
    console.log('count', orders.length);

    const ids = orders.map((o) => o.id);
    const led = await prisma.financialLedgerEntry.findMany({
        where: { orderId: { in: ids } },
        select: {
            orderId: true,
            totalCents: true,
            reversedAt: true,
            sourceType: true,
            sourceKey: true,
            description: true,
            category: true,
        },
    });
    console.log(
        'ledger',
        JSON.stringify(
            led.map((l) => ({
                order: orders.find((o) => o.id === l.orderId)?.orderNumber,
                euro: l.totalCents / 100,
                rev: !!l.reversedAt,
                type: l.sourceType,
                cat: l.category,
                key: l.sourceKey,
                desc: (l.description || '').slice(0, 90),
            })),
            null,
            2
        )
    );

    // Tax register T2/T3 — any Cesaroni lines?
    for (const q of [2, 3] as const) {
        const start = new Date(Date.UTC(2026, (q - 1) * 3, 1));
        const end = new Date(Date.UTC(2026, (q - 1) * 3 + 3, 0, 23, 59, 59, 999));
        const rep = await buildTaxRegisterReport({ start, end });
        const hit = rep.rows.filter(
            (r) =>
                /cesaroni|rumori|ft-mc-26/i.test(
                    `${r.orderNumber || ''} ${r.customerName || ''} ${r.description || ''}`
                )
        );
        console.log(
            `taxRegister T${q} cesaroniHits=${hit.length}`,
            hit.map((r) => ({
                n: r.orderNumber,
                euro: (r.grossCents || 0) / 100,
                date: r.date,
            }))
        );
    }

    const g = await prisma.order.findFirst({
        where: { orderNumber: 'FF-PD-26-004' },
        select: {
            orderNumber: true,
            isRecurring: true,
            stripeTransactionId: true,
            totalPriceCents: true,
            partnerPaymentStatus: true,
            additionalInstructions: true,
            buyerFullName: true,
            paymentMethodLabel: true,
        },
    });
    console.log('giulio FF-PD-26-004', g, 'pose?', g ? isPrepaidSubscriptionPoseOrder(g) : null);

    // Parent carnet / subscription fields?
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns WHERE table_name='Order' AND column_name ILIKE '%subscr%' OR (table_name='Order' AND column_name ILIKE '%carnet%') OR (table_name='Order' AND column_name ILIKE '%parent%') OR (table_name='Order' AND column_name ILIKE '%remain%') OR (table_name='Order' AND column_name ILIKE '%bundle%')`
    );
    console.log('order cols hint', cols);

    await prisma.$disconnect();
}
main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
