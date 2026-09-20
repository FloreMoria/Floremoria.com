/**
 * FASE 2 deepen: soft-match MANCANTE → ordini per stripeTransactionId / importo±data.
 */
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import prisma from '@/lib/prisma';

async function deepen(q: TaxQuarter) {
    const b = resolveQuarterBounds(2026, q);
    const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
    const mancante = built.rows.filter((r) => r.vatCertainty === 'MANCANTE');

    const txs = mancante.map((r) => r.transactionId).filter(Boolean);
    const byStripe = await prisma.order.findMany({
        where: {
            OR: [
                { stripeTransactionId: { in: txs } },
                ...txs.map((t) => ({
                    stripeTransactionId: { contains: t.slice(0, 20) },
                })),
            ],
            deletedAt: null,
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            stripeTransactionId: true,
            createdAt: true,
            buyerEmail: true,
            status: true,
            additionalInstructions: true,
            partnershipChannel: true,
        },
        take: 200,
    });

    // Also stripe movements with orderId
    const moves = await prisma.stripeFinanceMovement.findMany({
        where: { stripeId: { in: txs } },
        select: {
            stripeId: true,
            orderId: true,
            amountCents: true,
            description: true,
            metadataJson: true,
            type: true,
        },
    });

    const paypalMoves = await prisma.financialLedgerEntry.findMany({
        where: {
            OR: txs.map((t) => ({ sourceKey: { contains: t } })),
            reversedAt: null,
        },
        select: {
            sourceKey: true,
            orderId: true,
            totalCents: true,
            description: true,
            accountingDate: true,
        },
        take: 100,
    });

    // Orders around same amount ±2 days
    const candidates = [];
    for (const r of mancante) {
        const day = new Date(`${r.date}T12:00:00.000Z`);
        const from = new Date(day);
        from.setUTCDate(from.getUTCDate() - 3);
        const to = new Date(day);
        to.setUTCDate(to.getUTCDate() + 3);
        const near = await prisma.order.findMany({
            where: {
                deletedAt: null,
                isTest: false,
                totalPriceCents: r.grossCents,
                createdAt: { gte: from, lte: to },
            },
            select: {
                id: true,
                orderNumber: true,
                totalPriceCents: true,
                createdAt: true,
                stripeTransactionId: true,
                status: true,
            },
            take: 5,
        });
        const move = moves.find((m) => m.stripeId === r.transactionId);
        const byTx = byStripe.filter(
            (o) =>
                o.stripeTransactionId === r.transactionId ||
                (o.stripeTransactionId && r.transactionId.includes(o.stripeTransactionId)) ||
                (o.stripeTransactionId && o.stripeTransactionId.includes(r.transactionId))
        );
        const pp = paypalMoves.filter((p) => p.sourceKey?.includes(r.transactionId));

        // Heuristic group:
        // A if soft-match finds a unique order by tx or unique amount+date window
        let group: 'A' | 'B' = 'B';
        let reason = 'nessun ordine collegato né soft-match univoco';
        let matchedOrder: string | null = null;
        if (byTx.length === 1) {
            group = 'A';
            matchedOrder = byTx[0].orderNumber || byTx[0].id;
            reason = 'match stripeTransactionId su Order';
        } else if (move?.orderId) {
            group = 'A';
            matchedOrder = move.orderId;
            reason = 'StripeFinanceMovement.orderId valorizzato';
        } else if (pp.some((p) => p.orderId)) {
            group = 'A';
            matchedOrder = pp.find((p) => p.orderId)!.orderId;
            reason = 'FinancialLedgerEntry PayPal con orderId';
        } else if (near.length === 1) {
            group = 'A';
            matchedOrder = near[0].orderNumber || near[0].id;
            reason = 'soft-match univoco importo+±3gg';
        } else if (near.length > 1) {
            reason = `soft-match ambiguo: ${near.length} ordini stesso importo ±3gg`;
        }

        candidates.push({
            group,
            reason,
            matchedOrder,
            date: r.date,
            canale: r.canaleIncasso,
            lordo: Number((r.grossCents / 100).toFixed(2)),
            transactionId: r.transactionId,
            nearOrders: near.map((o) => ({
                orderNumber: o.orderNumber,
                createdAt: o.createdAt.toISOString().slice(0, 10),
                stripeTransactionId: o.stripeTransactionId,
            })),
            moveOrderId: move?.orderId ?? null,
            moveDesc: move?.description ?? null,
        });
    }

    const A = candidates.filter((c) => c.group === 'A');
    const B = candidates.filter((c) => c.group === 'B');
    return {
        quarter: `T${q}`,
        groupA: {
            count: A.length,
            lordo: Number((A.reduce((s, c) => s + c.lordo, 0)).toFixed(2)),
            rows: A,
        },
        groupB: {
            count: B.length,
            lordo: Number((B.reduce((s, c) => s + c.lordo, 0)).toFixed(2)),
            rows: B,
        },
    };
}

async function main() {
    const fs = await import('node:fs');
    const out = { T1: await deepen(1), T2: await deepen(2), T3: await deepen(3) };
    fs.writeFileSync('/tmp/mancante-deepen.json', JSON.stringify(out, null, 2));
    console.error('[ok] wrote /tmp/mancante-deepen.json');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
