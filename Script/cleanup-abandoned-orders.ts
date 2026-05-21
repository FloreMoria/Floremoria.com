/**
 * Soft-delete ordini abbandonati (PENDING + UNPAID) e CANCELLED dalla dashboard.
 * Uso: npx tsx Script/cleanup-abandoned-orders.ts
 */
import prisma from '../lib/prisma';
import { abandonedDashboardOrdersWhere } from '../lib/dashboardOrdersFilter';

async function main() {
    const candidates = await prisma.order.findMany({
        where: abandonedDashboardOrdersWhere(),
        select: { id: true, orderNumber: true, status: true, buyerEmail: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });

    console.log(`Trovati ${candidates.length} ordini da archiviare.`);

    if (candidates.length === 0) {
        return;
    }

    const result = await prisma.order.updateMany({
        where: abandonedDashboardOrdersWhere(),
        data: { deletedAt: new Date() },
    });

    console.log(`Archiviati (soft-delete) ${result.count} ordini.`);
    for (const order of candidates.slice(0, 10)) {
        console.log(`  - ${order.orderNumber || order.id} | ${order.status} | ${order.buyerEmail || 'no-email'}`);
    }
    if (candidates.length > 10) {
        console.log(`  ... e altri ${candidates.length - 10}`);
    }
}

main()
    .catch((err) => {
        console.error('[cleanup-abandoned-orders] Errore:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
