/**
 * Fase 3 Parte A — diagnostica ledger (sola lettura).
 * Uso: npx tsx scripts/audit-finance-fase3-precheck.ts
 *
 * 1) Duplicati BANK_LINE/ORDER + distribuzione sourceType (1166+)
 * 2) Doppi costi JSON_ENTRY vs MANUAL_EXPENSE
 * 3) Chiarimento metrica IVA (€134,97) + reverse charge
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';

type DupGroup = { key: string; count: number; ids: string[] };

function summarize(groups: DupGroup[]) {
    const dupes = groups.filter((g) => g.count > 1);
    return {
        groupsWithDupes: dupes.length,
        rowsInDupGroups: dupes.reduce((a, g) => a + g.count, 0),
        excessRowsBeyondFirst: dupes.reduce((a, g) => a + (g.count - 1), 0),
        top: dupes
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map((g) => ({ key: g.key, count: g.count, sampleIds: g.ids.slice(0, 3) })),
    };
}

function groupBy(items: Array<{ id: string; key: string }>): DupGroup[] {
    const map = new Map<string, DupGroup>();
    for (const it of items) {
        const cur = map.get(it.key);
        if (!cur) map.set(it.key, { key: it.key, count: 1, ids: [it.id] });
        else {
            cur.count += 1;
            cur.ids.push(it.id);
        }
    }
    return [...map.values()];
}

async function verification1() {
    const total = await prisma.financialLedgerEntry.count();
    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            bankLineId: true,
            orderId: true,
            createdAt: true,
            metadataJson: true,
        },
        take: 50000,
    });

    const bySourceType: Record<string, number> = {};
    const bySourceKeyPrefix: Record<string, number> = {};
    for (const r of rows) {
        bySourceType[r.sourceType] = (bySourceType[r.sourceType] || 0) + 1;
        const prefix = (r.sourceKey || '').split(':')[0] || r.sourceType;
        bySourceKeyPrefix[prefix] = (bySourceKeyPrefix[prefix] || 0) + 1;
    }

    const bankLineKeys: Array<{ id: string; key: string }> = [];
    const orderKeys: Array<{ id: string; key: string }> = [];
    for (const r of rows) {
        const sk = (r.sourceKey || '').trim();
        const blFromKey = sk.match(/^BANK_LINE(?:_MANUAL)?:(.+)$/i)?.[1]?.trim();
        const blId = (r.bankLineId || blFromKey || '').trim();
        if (blId) bankLineKeys.push({ id: r.id, key: `BANK_LINE:${blId}` });
        const orderId = (r.orderId || (r.sourceType === 'ORDER' ? r.sourceId : '') || '').trim();
        if (orderId) orderKeys.push({ id: r.id, key: `ORDER:${orderId}` });
    }

    const baselineFase1 = { scanned: 873, bankExcess: 47, orderExcess: 25 };
    const bank = summarize(groupBy(bankLineKeys));
    const order = summarize(groupBy(orderKeys));

    return {
        totalRowsIncludingReversed: total,
        activeRows: rows.length,
        deltaFromFase1Baseline: {
            baselineScanned: baselineFase1.scanned,
            nowActive: rows.length,
            addedApprox: rows.length - baselineFase1.scanned,
            note: 'Baseline Fase 1 = 873 active scan; oggi activeRows. Il delta include sync/gate successivi.',
        },
        distributionBySourceType: bySourceType,
        distributionBySourceKeyPrefix: bySourceKeyPrefix,
        bankLineSameId: {
            ...bank,
            fase1Excess: baselineFase1.bankExcess,
            excessDelta: bank.excessRowsBeyondFirst - baselineFase1.bankExcess,
        },
        orderSameId: {
            ...order,
            fase1Excess: baselineFase1.orderExcess,
            excessDelta: order.excessRowsBeyondFirst - baselineFase1.orderExcess,
        },
        writersMap: {
            throughCommitLedgerEntriesGate: [
                'lib/financial/ledgerWriteGate.ts (unica createMany)',
                'historicalLedgerSync.appendLedgerEntries / upsertLedgerEntry / syncHistoricalLedgerFromSources',
                'ingestSdiInvoices (appendLedgerEntries)',
                'registerGeneratedAutofattura (appendLedgerEntries)',
                'paypalSync / paypalWebhook / paypalCsvParser',
                'manualExpenses (upsertLedgerEntry)',
                'floristMissingInvoicesMutations (upsertLedgerEntry)',
                'bank-statements/[id]/lines/[lineId] (appendLedgerEntries)',
                'invoices/upload-foreign (appendLedgerEntries)',
            ],
            jsonFileOnlyNoNeonWrite: [
                'ledgerStore.addAccountingEntries / upsertAccountingEntries (dual-write disabilitato Fase 2)',
                'app/api/webhooks/stripe (solo JSON locale)',
                'reconciliation bank-fee / processManualOrders → JSON locale',
            ],
            directPrismaCreateOnLedger: 'NESSUNO (solo gate)',
            note: 'updateMany su allegati ORDER resta fuori dal gate ma non crea nuove scritture.',
        },
    };
}

async function verification2() {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceType: 'JSON_ENTRY' },
                { sourceType: 'MANUAL_EXPENSE' },
                { sourceKey: { startsWith: 'AUTOFATTURA_GEN:' } },
                { sourceKey: { startsWith: 'MANUAL_EXPENSE:' } },
                { sourceKey: { startsWith: 'JSON_ENTRY:' } },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            accountingDate: true,
            totalCents: true,
            counterpartyName: true,
            documentRef: true,
            description: true,
        },
        take: 20000,
    });

    const json = rows.filter((r) => r.sourceType === 'JSON_ENTRY' || r.sourceKey.startsWith('JSON_ENTRY:'));
    const manuals = rows.filter(
        (r) =>
            r.sourceType === 'MANUAL_EXPENSE' ||
            r.sourceKey.startsWith('MANUAL_EXPENSE:') ||
            r.sourceKey.startsWith('AUTOFATTURA_GEN:')
    );

    type Hit = {
        jsonId: string;
        manualId: string;
        amountCents: number;
        date: string;
        vendor: string;
        match: string;
    };
    const hits: Hit[] = [];
    const seen = new Set<string>();

    for (const j of json) {
        if (j.totalCents >= 0) continue; // costi = uscite
        const day = j.accountingDate.toISOString().slice(0, 10);
        const abs = Math.abs(j.totalCents);
        const vendorJ = (j.counterpartyName || '').toLowerCase().trim();
        for (const m of manuals) {
            if (m.totalCents >= 0 && m.totalCents !== -abs && Math.abs(m.totalCents) !== abs) continue;
            const dayM = m.accountingDate.toISOString().slice(0, 10);
            const absM = Math.abs(m.totalCents);
            if (abs !== absM) continue;
            const vendorM = (m.counterpartyName || '').toLowerCase().trim();
            let match = '';
            if (day === dayM && vendorJ && vendorM && (vendorJ.includes(vendorM) || vendorM.includes(vendorJ))) {
                match = 'date+amount+vendor';
            } else if (day === dayM) {
                match = 'date+amount';
            } else if (
                j.documentRef &&
                m.documentRef &&
                j.documentRef === m.documentRef
            ) {
                match = 'documentRef+amount';
            } else {
                continue;
            }
            const pairKey = `${j.id}|${m.id}`;
            if (seen.has(pairKey)) continue;
            seen.add(pairKey);
            hits.push({
                jsonId: j.id,
                manualId: m.id,
                amountCents: abs,
                date: day,
                vendor: j.counterpartyName || m.counterpartyName || '',
                match,
            });
        }
    }

    const uniqueJson = new Set(hits.map((h) => h.jsonId));
    const duplicateCostCents = [...uniqueJson].reduce((acc, id) => {
        const h = hits.find((x) => x.jsonId === id)!;
        return acc + h.amountCents;
    }, 0);

    return {
        jsonCostCandidates: json.filter((r) => r.totalCents < 0).length,
        manualCostCandidates: manuals.filter((r) => r.totalCents < 0 || r.totalCents !== 0).length,
        overlappingPairs: hits.length,
        uniqueJsonEntriesOverlapping: uniqueJson.size,
        potentialDuplicateCostCents: duplicateCostCents,
        potentialDuplicateCostEuro: (duplicateCostCents / 100).toFixed(2),
        sample: hits.slice(0, 15),
    };
}

async function verification3() {
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });

    const reverseChargeMeta = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { metadataJson: { path: ['isReverseCharge'], equals: true } },
                { metadataJson: { path: ['reverseCharge'], equals: true } },
                { sourceKey: { startsWith: 'AUTOFATTURA_GEN:' } },
                { sourceKey: { startsWith: 'SAAS_INVOICE:' } },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            direction: true,
            vatCents: true,
            netCents: true,
            totalCents: true,
            metadataJson: true,
            category: true,
        },
        take: 5000,
    });

    let rcWithVatDebit = 0;
    let rcWithVatCredit = 0;
    let rcVatZero = 0;
    let rcVirtualVatCents = 0;
    for (const r of reverseChargeMeta) {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const virtual =
            typeof meta.reverseChargeVatCents === 'number'
                ? meta.reverseChargeVatCents
                : typeof meta.vatCentsVirtual === 'number'
                  ? meta.vatCentsVirtual
                  : 0;
        rcVirtualVatCents += Math.abs(virtual || 0);
        if (r.vatCents === 0) rcVatZero += 1;
        if (r.direction === 'ENTRATA' && r.vatCents !== 0) rcWithVatDebit += 1;
        if (r.direction === 'USCITA' && r.vatCents !== 0) rcWithVatCredit += 1;
    }

    // Autofatture in manual_finance_expenses: vatCents spesso “virtuale”
    const afExpenses = await prisma.manualFinanceExpense.findMany({
        where: {
            OR: [
                { notes: { startsWith: 'AUTOFATTURA_TD' } },
                { metadataJson: { path: ['isReverseCharge'], equals: true } },
            ],
        },
        select: { id: true, vatCents: true, netCents: true, totalCents: true, metadataJson: true },
        take: 2000,
    });

    return {
        interpretation: {
            ivaDebitoCents: pnl.ivaDebitoCents,
            ivaCreditoCents: pnl.ivaCreditoCents,
            ivaNettaCents: pnl.ivaNettaCents,
            isNetOrDebitOnly:
                'La metrica Fase 2 (€134,97) era ivaDebitoCents = solo IVA a debito su ricavi ENTRATA, NON l’IVA netta.',
            euroDebito: (pnl.ivaDebitoCents / 100).toFixed(2),
            euroCredito: (pnl.ivaCreditoCents / 100).toFixed(2),
            euroNetta: (pnl.ivaNettaCents / 100).toFixed(2),
        },
        reverseChargeLedger: {
            rows: reverseChargeMeta.length,
            rowsWithVatCentsZero: rcVatZero,
            rowsWithVatOnUscitaCredit: rcWithVatCredit,
            rowsWithVatOnEntrataDebit: rcWithVatDebit,
            virtualVatInMetadataCents: rcVirtualVatCents,
            finding:
                rcWithVatDebit === 0 && rcWithVatCredit === 0
                    ? 'BUG/CONFERMATO: autofatture/reverse charge in ledger hanno tipicamente vatCents=0 — né debito né credito in PnL; IVA RC resta solo in metadata virtuale / ManualFinanceExpense.'
                    : rcWithVatDebit === 0 && rcWithVatCredit > 0
                      ? 'BUG: reverse charge compare solo come IVA a credito (abbassa ivaNetta) senza parallelo a debito.'
                      : 'Reverse charge presente sia a debito sia a credito (o parziale).',
        },
        autofatturaExpenses: {
            count: afExpenses.length,
            sumVatCentsOnExpense: afExpenses.reduce((a, e) => a + Math.abs(e.vatCents || 0), 0),
        },
    };
}

async function main() {
    console.log('[fase3-precheck] start');
    const [v1, v2, v3] = await Promise.all([
        verification1(),
        verification2(),
        verification3(),
    ]);
    const report = {
        generatedAt: new Date().toISOString(),
        verification1_duplicates: v1,
        verification2_doubleCosts: v2,
        verification3_iva: v3,
    };
    console.log(JSON.stringify(report, null, 2));
    console.log('[fase3-precheck] done');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
