/**
 * Elenco a richiesta: ordini pagati nell’esercizio A con consegna nell’esercizio B.
 * Uso commercialista (risconto / competenza fine anno). Nessuna automazione.
 *
 *   npx tsx scripts/list-orders-cross-year.ts --paid=2026 --delivery=2027
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import prisma from '@/lib/prisma';

function arg(name: string, fallback: number): number {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    if (!hit) return fallback;
    const n = Number(hit.split('=')[1]);
    return Number.isFinite(n) ? n : fallback;
}

async function main() {
    const paidYear = arg('paid', new Date().getFullYear());
    const deliveryYear = arg('delivery', paidYear + 1);

    const payStart = new Date(Date.UTC(paidYear, 0, 1));
    const payEnd = new Date(Date.UTC(paidYear, 11, 31, 23, 59, 59, 999));
    const delStart = new Date(Date.UTC(deliveryYear, 0, 1));
    const delEnd = new Date(Date.UTC(deliveryYear, 11, 31, 23, 59, 59, 999));

    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: payStart, lte: payEnd },
            deliveryDate: { gte: delStart, lte: delEnd },
        },
        select: {
            orderNumber: true,
            createdAt: true,
            deliveryDate: true,
            totalPriceCents: true,
            buyerFullName: true,
            buyerEmail: true,
            deceasedName: true,
            stripeTransactionId: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const rows = orders.map((o) => ({
        orderNumber: o.orderNumber,
        paidAt: o.createdAt.toISOString().slice(0, 10),
        deliveryAt: o.deliveryDate!.toISOString().slice(0, 10),
        euro: o.totalPriceCents / 100,
        buyer: o.buyerFullName || o.buyerEmail,
        deceased: o.deceasedName,
        gateway: o.stripeTransactionId ? 'yes' : 'no',
    }));

    console.log(
        JSON.stringify(
            {
                paidYear,
                deliveryYear,
                count: rows.length,
                totalEuro: rows.reduce((s, r) => s + r.euro, 0),
                rows,
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
