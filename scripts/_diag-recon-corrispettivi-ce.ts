/**
 * Riconciliazione corrispettivi gateway → vendite CE (sola lettura prima, poi guida fix).
 */
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

function euro(c: number) {
    return (c / 100).toFixed(2);
}

async function main() {
    const gwRows: Array<{
        tx: string;
        date: string;
        channel: string;
        grossCents: number;
        orderId: string | null;
        orderNumber: string;
    }> = [];
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(2026, q);
        if (b.start > new Date()) continue;
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            gwRows.push({
                tx: r.transactionId,
                date: r.date,
                channel: r.canaleIncasso,
                grossCents: Math.abs(r.grossCents),
                orderId: r.orderId,
                orderNumber: r.orderNumber || '',
            });
        }
    }
    const gwSum = gwRows.reduce((s, r) => s + r.grossCents, 0);

    const all = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            category: true,
            direction: true,
            totalCents: true,
            vatCents: true,
            netCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
            bankLineId: true,
            metadataJson: true,
            documentRef: true,
            orderId: true,
            attachmentUrl: true,
        },
    });

    const rawVendite = all.filter(
        (r) => r.category === 'RICAVI_VENDITE' && (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const rawSum = rawVendite.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    const after = applyFiscalAuthorityHierarchy(all as never[]);
    const hierVendite = after.filter(
        (r) => r.category === 'RICAVI_VENDITE' && (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const hierSum = hierVendite.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const suppressed = rawVendite.filter((r) => !hierVendite.some((h) => h.id === r.id));

    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const ceVendite = pnl.venditeCaratteristicheCents;

    // Match gateway ↔ ledger RICAVI by amount+date or tx in sourceKey
    const usedLed = new Set<string>();
    const matched: Array<{ gw: string; led: string; euro: string; how: string }> = [];
    const gwUnmatched: typeof gwRows = [];

    for (const g of gwRows) {
        const byTx = rawVendite.find(
            (r) =>
                !usedLed.has(r.id) &&
                ((r.sourceKey || '').includes(g.tx) ||
                    (r.documentRef || '').includes(g.tx) ||
                    (r.description || '').includes(g.tx))
        );
        if (byTx) {
            usedLed.add(byTx.id);
            matched.push({
                gw: g.tx,
                led: byTx.sourceKey || byTx.id,
                euro: euro(g.grossCents),
                how: 'tx',
            });
            continue;
        }
        const byOrd =
            g.orderId &&
            rawVendite.find(
                (r) => !usedLed.has(r.id) && (r.orderId === g.orderId || r.documentRef === g.orderNumber)
            );
        if (byOrd) {
            usedLed.add(byOrd.id);
            matched.push({
                gw: g.tx,
                led: byOrd.sourceKey || byOrd.id,
                euro: euro(g.grossCents),
                how: 'order',
            });
            continue;
        }
        const byAmt = rawVendite.find(
            (r) =>
                !usedLed.has(r.id) &&
                Math.abs(r.totalCents) === g.grossCents &&
                r.accountingDate &&
                Math.abs(
                    (r.accountingDate.getTime() - Date.parse(g.date + 'T12:00:00Z')) / 86400000
                ) <= 3
        );
        if (byAmt) {
            usedLed.add(byAmt.id);
            matched.push({
                gw: g.tx,
                led: byAmt.sourceKey || byAmt.id,
                euro: euro(g.grossCents),
                how: 'amt±3d',
            });
            continue;
        }
        gwUnmatched.push(g);
    }

    const ledOrphans = rawVendite.filter((r) => !usedLed.has(r.id));

    // Gateway amounts that live elsewhere in ledger (transfer, etc.)
    const elsewhere = [];
    for (const g of gwUnmatched) {
        const hit = all.find(
            (r) =>
                (r.sourceKey || '').includes(g.tx) ||
                (r.description || '').includes(g.tx) ||
                (g.orderId && r.orderId === g.orderId && Math.abs(r.totalCents) === g.grossCents)
        );
        elsewhere.push({
            tx: g.tx,
            euro: euro(g.grossCents),
            channel: g.channel,
            orderNumber: g.orderNumber || null,
            ledgerCat: hit?.category || null,
            ledgerKey: hit?.sourceKey || null,
            desc: (hit?.description || g.tx).slice(0, 80),
        });
    }

    // PnL path: hier → after refund reduction
    const refundUscita = after.filter(
        (r) => r.category === 'RIMBORSI' && (r.direction === 'USCITA' || r.totalCents < 0)
    );
    // dedupe same amount same day
    const seenRef = new Set<string>();
    let refundAbs = 0;
    const refundRows = [];
    for (const r of refundUscita) {
        const k = `${Math.abs(r.totalCents)}:${r.accountingDate?.toISOString().slice(0, 10)}`;
        if (seenRef.has(k)) continue;
        seenRef.add(k);
        refundAbs += Math.abs(r.totalCents);
        refundRows.push({
            euro: euro(-Math.abs(r.totalCents)),
            key: r.sourceKey,
            desc: (r.description || '').slice(0, 60),
        });
    }

    // Other filters in computeHistoricalPnl: pose revenue exclusion
    const poseRefs = await (async () => {
        const { loadPrepaidPoseRefSets, isPrepaidPoseRevenueEntry } = await import(
            '@/lib/financial/historicalLedgerQuery'
        );
        // loadPrepaidPoseRefSets may not be exported — try
        return null;
    })().catch(() => null);

    const bridge = {
        gatewayEuro: euro(gwSum),
        gatewayN: gwRows.length,
        step_matchedToRawRicavi: {
            n: matched.length,
            euro: euro(matched.reduce((s, m) => s + Math.round(parseFloat(m.euro) * 100), 0)),
        },
        step_gwNotInRicavi: {
            n: gwUnmatched.length,
            euro: euro(gwUnmatched.reduce((s, g) => s + g.grossCents, 0)),
            byLedgerCategory: elsewhere.reduce(
                (m, e) => {
                    const k = e.ledgerCat || 'NO_LEDGER';
                    m[k] = m[k] || { n: 0, euro: 0 };
                    m[k].n++;
                    m[k].euro += Math.round(parseFloat(e.euro) * 100);
                    return m;
                },
                {} as Record<string, { n: number; euro: number }>
            ),
            rows: elsewhere,
        },
        rawRicaviEuro: euro(rawSum),
        rawRicaviOrphansNotInGw: {
            n: ledOrphans.length,
            euro: euro(ledOrphans.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            sample: ledOrphans.slice(0, 15).map((r) => ({
                euro: euro(Math.abs(r.totalCents)),
                key: r.sourceKey,
                desc: (r.description || '').slice(0, 60),
            })),
        },
        hierarchySuppressed: {
            n: suppressed.length,
            euro: euro(suppressed.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            rows: suppressed.map((r) => ({
                euro: euro(Math.abs(r.totalCents)),
                key: r.sourceKey,
                desc: (r.description || '').slice(0, 60),
            })),
        },
        hierarchyVenditeEuro: euro(hierSum),
        customerRefundsReduceVendite: {
            euro: euro(refundAbs),
            rows: refundRows,
        },
        ceVenditeEuro: euro(ceVendite),
        residualHierMinusCeMinusRefunds: euro(hierSum - ceVendite - refundAbs),
        totalGapGwToCe: euro(gwSum - ceVendite),
    };

    // Format byCategory euro
    const byCatFmt = Object.fromEntries(
        Object.entries(bridge.step_gwNotInRicavi.byLedgerCategory).map(([k, v]) => [
            k,
            { n: v.n, euro: euro(v.euro) },
        ])
    );

    console.log(
        JSON.stringify(
            {
                ...bridge,
                step_gwNotInRicavi: {
                    ...bridge.step_gwNotInRicavi,
                    byLedgerCategory: byCatFmt,
                },
            },
            null,
            2
        )
    );

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
