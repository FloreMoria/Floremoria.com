/**
 * FASE 2 — classificazione sola lettura righe MANCANTE T1/T2/T3 2026.
 */
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { filterGatewayIncassiForCorrispettivi } from '@/lib/financial/corrispettiviSalesFilter';
import prisma from '@/lib/prisma';

async function dumpQuarter(q: TaxQuarter) {
    const b = resolveQuarterBounds(2026, q);
    const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
    const mancante = built.rows.filter((r) => r.vatCertainty === 'MANCANTE');

    // Enrich: does order exist in DB / sales report signals
    const orderIds = mancante.map((r) => r.orderId).filter(Boolean) as string[];
    const orders = orderIds.length
        ? await prisma.order.findMany({
              where: { id: { in: orderIds } },
              select: {
                  id: true,
                  orderNumber: true,
                  totalPriceCents: true,
                  status: true,
                  isTest: true,
                  deletedAt: true,
              },
          })
        : [];
    const byId = new Map(orders.map((o) => [o.id, o]));

    const rows = mancante.map((r) => {
        const ord = r.orderId ? byId.get(r.orderId) : null;
        const hasRealOrder =
            Boolean(ord) && !ord!.isTest && !ord!.deletedAt && ord!.status !== 'CANCELLED';
        // Group A: linked to real order → sale to scorporate at 10%
        // Group B: no real order → exclude from register
        const group: 'A' | 'B' = hasRealOrder ? 'A' : 'B';
        return {
            group,
            orderNumber: r.orderNumber || ord?.orderNumber || '',
            orderId: r.orderId,
            date: r.date,
            canale: r.canaleIncasso,
            lordoCents: r.grossCents,
            lordo: Number((r.grossCents / 100).toFixed(2)),
            transactionId: r.transactionId,
            hasOrderLinked: Boolean(r.orderId),
            hasRealOrder,
            orderTotalCents: ord?.totalPriceCents ?? null,
            orderStatus: ord?.status ?? null,
            note: r.vatRuleNote,
        };
    });

    const groupA = rows.filter((r) => r.group === 'A');
    const groupB = rows.filter((r) => r.group === 'B');

    return {
        quarter: `T${q}`,
        label: b.label,
        totalCorrispettiviRows: built.rows.length,
        mancanteCount: mancante.length,
        mancanteLordo: Number(
            (mancante.reduce((s, r) => s + r.grossCents, 0) / 100).toFixed(2)
        ),
        groupA: {
            count: groupA.length,
            lordo: Number((groupA.reduce((s, r) => s + r.lordoCents, 0) / 100).toFixed(2)),
            rows: groupA,
        },
        groupB: {
            count: groupB.length,
            lordo: Number((groupB.reduce((s, r) => s + r.lordoCents, 0) / 100).toFixed(2)),
            rows: groupB,
        },
    };
}

async function main() {
    const out = {
        T1: await dumpQuarter(1),
        T2: await dumpQuarter(2),
        T3: await dumpQuarter(3),
    };
    console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
