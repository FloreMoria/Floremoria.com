/**
 * Diagnosi pre-fix: coppie fattura/bonifico + IVA; rimborsi; vendite freeze vs oggi.
 */
import prisma from '@/lib/prisma';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';

function euro(c: number) {
    return (c / 100).toFixed(2);
}

async function main() {
    const rows = await prisma.financialLedgerEntry.findMany({
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

    // ── Coppie: expense matched to bank ───────────────────────────────
    const expenses = await prisma.manualFinanceExpense.findMany({
        where: {
            matchedStatementLineId: { not: null },
            expenseDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
        },
        select: {
            id: true,
            vendorName: true,
            totalCents: true,
            vatCents: true,
            netCents: true,
            matchedStatementLineId: true,
            expenseDate: true,
            docType: true,
            description: true,
        },
    });

    const after = applyFiscalAuthorityHierarchy(rows as never[]);
    const afterByKey = new Map(after.map((r) => [r.sourceKey || r.id, r]));
    const afterIds = new Set(after.map((r) => r.id));

    const pairs = [];
    for (const exp of expenses) {
        const bankId = exp.matchedStatementLineId!;
        const expLed = rows.find(
            (r) =>
                r.sourceKey === `MANUAL_EXPENSE:${exp.id}` ||
                (r.sourceType === 'MANUAL_EXPENSE' && r.sourceId === exp.id)
        );
        const bankLed = rows.find(
            (r) =>
                r.sourceKey === `BANK_LINE:${bankId}` ||
                r.sourceKey === `BANK_LINE_MANUAL:${bankId}` ||
                ((r.sourceType === 'BANK_LINE' || r.sourceType === 'BANK_LINE_MANUAL') &&
                    r.sourceId === bankId)
        );
        if (!expLed || !bankLed) {
            pairs.push({
                expenseId: exp.id,
                vendor: exp.vendorName,
                euro: euro(exp.totalCents),
                vatExpense: euro(exp.vatCents),
                status: 'incomplete_ledger',
                hasExpLed: !!expLed,
                hasBankLed: !!bankLed,
            });
            continue;
        }
        const expKept = afterIds.has(expLed.id);
        const bankKept = afterIds.has(bankLed.id);
        const kept = expKept ? expLed : bankKept ? bankLed : null;
        pairs.push({
            expenseId: exp.id,
            vendor: exp.vendorName,
            docType: exp.docType,
            euro: euro(Math.abs(exp.totalCents)),
            vatOnExpenseRow: euro(Math.abs(expLed.vatCents)),
            vatOnBankRow: euro(Math.abs(bankLed.vatCents)),
            vatOnExpenseTable: euro(Math.abs(exp.vatCents)),
            keptSource: kept
                ? kept.sourceType.startsWith('BANK')
                    ? 'BANK'
                    : kept.sourceType
                : 'NONE',
            keptVatCents: kept ? Math.abs(kept.vatCents) : 0,
            vatLostIfBankKept:
                bankKept && !expKept && Math.abs(expLed.vatCents) > 0 && Math.abs(bankLed.vatCents) === 0,
            expKept,
            bankKept,
        });
    }

    const vatRisk = pairs.filter((p) => p.vatLostIfBankKept);
    console.log(
        '---PAIRS---',
        JSON.stringify(
            {
                n: pairs.length,
                vatRiskN: vatRisk.length,
                vatRiskEuro: euro(
                    vatRisk.reduce((s, p) => s + Math.round(parseFloat(String(p.vatOnExpenseRow)) * 100), 0)
                ),
                byKept: {
                    BANK: pairs.filter((p) => p.keptSource === 'BANK').length,
                    MANUAL_EXPENSE: pairs.filter((p) => p.keptSource === 'MANUAL_EXPENSE').length,
                    other: pairs.filter(
                        (p) => p.keptSource && p.keptSource !== 'BANK' && p.keptSource !== 'MANUAL_EXPENSE'
                    ).length,
                },
                pairs,
            },
            null,
            2
        )
    );

    // ── Rimborsi ──────────────────────────────────────────────────────
    const rimborsi = rows.filter((r) => r.category === 'RIMBORSI');
    const rimborsiAfter = after.filter((r) => r.category === 'RIMBORSI');
    console.log(
        '---RIMBORSI---',
        JSON.stringify(
            {
                rawN: rimborsi.length,
                rawSumSigned: euro(rimborsi.reduce((s, r) => s + r.totalCents, 0)),
                rawSumAbs: euro(rimborsi.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
                afterN: rimborsiAfter.length,
                afterSumSigned: euro(rimborsiAfter.reduce((s, r) => s + r.totalCents, 0)),
                rows: rimborsiAfter.map((r) => ({
                    date: r.accountingDate?.toISOString().slice(0, 10),
                    totalCents: r.totalCents,
                    direction: r.direction,
                    euro: euro(r.totalCents),
                    sourceKey: r.sourceKey,
                    desc: (r.description || '').slice(0, 80),
                })),
            },
            null,
            2
        )
    );

    // ── Vendite freeze vs oggi ─────────────────────────────────────────
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const venditeToday = after.filter(
        (r) =>
            r.category === 'RICAVI_VENDITE' &&
            (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const venditeSum = venditeToday.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // Freeze 11/09: venditePnL 3665.31 — list from rv-noise cleanup post state if available
    const freezeTarget = 366531;
    console.log(
        '---VENDITE---',
        JSON.stringify(
            {
                freezePnL: '3665.31',
                todayPnL: euro(pnl.venditeCaratteristicheCents),
                todayHierarchySum: euro(venditeSum),
                delta: euro(pnl.venditeCaratteristicheCents - freezeTarget),
                todayN: venditeToday.length,
                sample: venditeToday
                    .sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
                    .slice(0, 15)
                    .map((r) => ({
                        euro: euro(Math.abs(r.totalCents)),
                        key: r.sourceKey,
                        date: r.accountingDate?.toISOString().slice(0, 10),
                        desc: (r.description || '').slice(0, 60),
                    })),
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
