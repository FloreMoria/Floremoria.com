/**
 * Pre-Fase 4 — audit analitico (sola lettura).
 * 3) Excess netto costi JSON vs MANUAL
 * 4) Impatto quarantena su costi/IVA credito
 * 5) Ricavi con vatCents=0 vs target payout Fase 4
 *
 * Uso: npx tsx scripts/audit-finance-pre-fase4.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { dryRunClassifyBankLine } from '../lib/financial/payoutClassification';
import { canonicalDocumentKeysMatch } from '../lib/financial/canonicalDocumentKey';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function dayKey(d: Date) {
    return d.toISOString().slice(0, 10);
}

function yearOf(d: Date) {
    return d.getUTCFullYear();
}

function quarterOf(d: Date) {
    return Math.floor(d.getUTCMonth() / 3) + 1;
}

/** Trimestri IVA già liquidati rispetto a oggi (Europe/Rome approx UTC). */
function isIvaLiquidated(d: Date, asOf = new Date()): boolean {
    const y = yearOf(d);
    const q = quarterOf(d);
    // Scadenza liquidazione trimestrale semplificata: 16 del 2° mese successivo
    const deadlineMonth = q * 3 + 1; // Q1→apr(4), Q2→jul(7), Q3→oct(10), Q4→jan+1
    const deadline = new Date(Date.UTC(deadlineMonth > 12 ? y + 1 : y, (deadlineMonth - 1) % 12, 16));
    return asOf >= deadline;
}

type CostRow = {
    id: string;
    sourceType: string;
    sourceKey: string;
    accountingDate: Date;
    totalCents: number;
    counterpartyName: string | null;
    documentRef: string | null;
    metadataJson: unknown;
};

function costFingerprint(r: CostRow): string {
    const meta = (r.metadataJson || {}) as Record<string, unknown>;
    const dedupe =
        typeof meta.dedupeKey === 'string'
            ? meta.dedupeKey
            : [r.counterpartyName || '', r.documentRef || '', dayKey(r.accountingDate), Math.abs(r.totalCents)].join(
                  '|'
              );
    return `${dayKey(r.accountingDate)}|${Math.abs(r.totalCents)}|${(r.counterpartyName || '').toUpperCase().slice(0, 40)}|${dedupe}`;
}

async function measureCostExcess() {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            direction: 'USCITA',
            OR: [{ sourceType: 'JSON_ENTRY' }, { sourceType: 'MANUAL_EXPENSE' }],
        },
        select: {
            id: true,
            sourceType: true,
            sourceKey: true,
            accountingDate: true,
            totalCents: true,
            counterpartyName: true,
            documentRef: true,
            metadataJson: true,
        },
    });

    const json = rows.filter((r) => r.sourceType === 'JSON_ENTRY' || r.sourceKey.startsWith('JSON_ENTRY:'));
    const manual = rows.filter((r) => r.sourceType === 'MANUAL_EXPENSE');

    // Match: stesso giorno + stesso |importo| (+ fornitore soft o dedupeKey)
    type Pair = { json: CostRow; manual: CostRow; amountAbs: number };
    const pairs: Pair[] = [];
    const usedManual = new Set<string>();
    const usedJson = new Set<string>();

    for (const j of json) {
        const jDay = dayKey(j.accountingDate);
        const jAbs = Math.abs(j.totalCents);
        const jMeta = (j.metadataJson || {}) as Record<string, unknown>;
        const jKey = typeof jMeta.dedupeKey === 'string' ? jMeta.dedupeKey : null;
        let best: CostRow | null = null;
        for (const m of manual) {
            if (usedManual.has(m.id)) continue;
            if (dayKey(m.accountingDate) !== jDay) continue;
            if (Math.abs(m.totalCents) !== jAbs) continue;
            const mMeta = (m.metadataJson || {}) as Record<string, unknown>;
            const mKey = typeof mMeta.dedupeKey === 'string' ? mMeta.dedupeKey : null;
            if (jKey && mKey && canonicalDocumentKeysMatch(jKey, mKey)) {
                best = m;
                break;
            }
            const jName = (j.counterpartyName || '').toUpperCase();
            const mName = (m.counterpartyName || '').toUpperCase();
            if (jName && mName && (jName.includes(mName.slice(0, 8)) || mName.includes(jName.slice(0, 8)))) {
                best = m;
                break;
            }
            // fallback: stesso giorno+importo
            if (!best) best = m;
        }
        if (best) {
            pairs.push({ json: j, manual: best, amountAbs: jAbs });
            usedManual.add(best.id);
            usedJson.add(j.id);
        }
    }

    // Excess netto = una sola gamba (il ramo duplicato eccedente) = somma amountAbs dei pair
    const excessNetCents = pairs.reduce((s, p) => s + p.amountAbs, 0);
    const grossBothLegsCents = excessNetCents * 2;

    const byYear: Record<string, { pairs: number; excessNetCents: number; liquidatedPairs: number }> = {};
    for (const p of pairs) {
        const y = String(yearOf(p.json.accountingDate));
        if (!byYear[y]) byYear[y] = { pairs: 0, excessNetCents: 0, liquidatedPairs: 0 };
        byYear[y].pairs += 1;
        byYear[y].excessNetCents += p.amountAbs;
        if (isIvaLiquidated(p.json.accountingDate)) byYear[y].liquidatedPairs += 1;
    }

    const liquidatedPairs = pairs.filter((p) => isIvaLiquidated(p.json.accountingDate)).length;
    const liquidatedExcessCents = pairs
        .filter((p) => isIvaLiquidated(p.json.accountingDate))
        .reduce((s, p) => s + p.amountAbs, 0);

    return {
        jsonCostRows: json.length,
        manualCostRows: manual.length,
        overlapPairs: pairs.length,
        grossBothLegsEuro: euro(grossBothLegsCents),
        excessNetEuro: euro(excessNetCents),
        excessNetCents,
        byYear: Object.fromEntries(
            Object.entries(byYear).map(([y, v]) => [
                y,
                { ...v, excessNetEuro: euro(v.excessNetCents) },
            ])
        ),
        liquidatedPairs,
        liquidatedExcessEuro: euro(liquidatedExcessCents),
        sampleFingerprints: pairs.slice(0, 5).map((p) => ({
            jsonKey: p.json.sourceKey,
            manualKey: p.manual.sourceKey,
            amount: euro(p.amountAbs),
            day: dayKey(p.json.accountingDate),
            fp: costFingerprint(p.json),
        })),
    };
}

async function measureQuarantineImpact() {
    const year = new Date().getFullYear();
    const quarantineManual = await prisma.manualFinanceExpense.findMany({
        where: { verificationStatus: 'QUARANTINE' },
        select: { id: true, totalCents: true, vatCents: true, expenseDate: true },
    });
    const quarantineSaas = await prisma.saasForeignInvoice.findMany({
        where: { verificationStatus: 'QUARANTINE' },
        select: { id: true, eurAmountCents: true },
    });

    const qIds = quarantineManual.map((r) => r.id);
    const linkedLedger = qIds.length
        ? await prisma.financialLedgerEntry.findMany({
              where: {
                  reversedAt: null,
                  sourceType: 'MANUAL_EXPENSE',
                  sourceId: { in: qIds },
              },
              select: { totalCents: true, vatCents: true },
          })
        : [];

    const pnlWithFilter = await computeHistoricalPnl({ fiscalYear: year });

    // Stima impatto: costi/IVA delle spese quarantine (tabella) + ledger collegato escluso
    const costiExcludedTableCents = quarantineManual.reduce(
        (s, r) => s + Math.abs(r.totalCents),
        0
    );
    const ivaCreditoExcludedTableCents = quarantineManual.reduce(
        (s, r) => s + Math.abs(r.vatCents || 0),
        0
    );
    const costiExcludedLedgerCents = linkedLedger.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const ivaCreditoExcludedLedgerCents = linkedLedger.reduce(
        (s, r) => s + Math.abs(r.vatCents || 0),
        0
    );
    const saasExcludedCents = quarantineSaas.reduce((s, r) => s + Math.abs(r.eurAmountCents), 0);

    return {
        quarantineDocumentCount: quarantineManual.length + quarantineSaas.length,
        quarantineManual: quarantineManual.length,
        quarantineSaas: quarantineSaas.length,
        costiExcludedFromExpenseTotalsEuro: euro(costiExcludedTableCents),
        ivaCreditoExcludedFromExpenseTotalsEuro: euro(ivaCreditoExcludedTableCents),
        costiExcludedFromLedgerPnlEuro: euro(costiExcludedLedgerCents),
        ivaCreditoExcludedFromLedgerPnlEuro: euro(ivaCreditoExcludedLedgerCents),
        saasExcludedEuro: euro(saasExcludedCents),
        pnlSnapshot: {
            costiProduzioneEuro: euro(pnlWithFilter.costiProduzioneCents),
            costiSaasEuro: euro(pnlWithFilter.costiSaasCents),
            ivaCreditoEuro: euro(pnlWithFilter.ivaCreditoCents),
            ivaDebitoEuro: euro(pnlWithFilter.ivaDebitoCents),
        },
        note:
            'Fase 3: nuovi QUARANTINE non scrivono ledger; esclusione PnL agisce su sourceId MANUAL_EXPENSE già presenti. Legacy NULL = ancora incluso.',
    };
}

async function measureVatZeroRevenues() {
    const revenueCats = ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI'];
    const revenues = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            category: { in: revenueCats },
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: {
            id: true,
            sourceType: true,
            sourceKey: true,
            sourceId: true,
            totalCents: true,
            vatCents: true,
            category: true,
            accountingDate: true,
            description: true,
            bankLineId: true,
        },
    });

    const vatZero = revenues.filter((r) => (r.vatCents || 0) === 0);
    const vatZeroTotalCents = vatZero.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // Target Fase 4 (stesso criterio acceptance): BANK_LINE in ricavo con PAYOUT_MATCHED
    const revenueBank = revenues.filter((r) => r.sourceType === 'BANK_LINE');
    const fase4Targets: Array<{ bankLineId: string; amountCents: number; vatCents: number }> = [];
    for (const r of revenueBank) {
        const blId = r.bankLineId || r.sourceId;
        if (!blId) continue;
        const line = await prisma.bankStatementLine.findUnique({
            where: { id: blId },
            select: {
                id: true,
                amountCents: true,
                accountingDate: true,
                valueDate: true,
                description: true,
                matchType: true,
            },
        });
        if (!line || line.amountCents <= 0) continue;
        const cls = await dryRunClassifyBankLine(line);
        if (cls.kind !== 'PAYOUT_MATCHED') continue;
        fase4Targets.push({
            bankLineId: line.id,
            amountCents: Math.abs(r.totalCents),
            vatCents: Math.abs(r.vatCents || 0),
        });
    }

    const targetIds = new Set(fase4Targets.map((t) => t.bankLineId));
    const overlapWithFase4 = vatZero.filter((r) => {
        const blId = r.bankLineId || r.sourceId || r.sourceKey.replace(/^BANK_LINE:/, '');
        return r.sourceType === 'BANK_LINE' && targetIds.has(blId);
    });

    const residual = vatZero.filter((r) => {
        const blId = r.bankLineId || r.sourceId || r.sourceKey.replace(/^BANK_LINE:/, '');
        return !(r.sourceType === 'BANK_LINE' && targetIds.has(blId));
    });

    const residualBySource: Record<string, { count: number; totalCents: number }> = {};
    for (const r of residual) {
        if (!residualBySource[r.sourceType]) residualBySource[r.sourceType] = { count: 0, totalCents: 0 };
        residualBySource[r.sourceType].count += 1;
        residualBySource[r.sourceType].totalCents += Math.abs(r.totalCents);
    }

    const fase4Sum = fase4Targets.reduce((s, t) => s + t.amountCents, 0);

    return {
        revenueRows: revenues.length,
        revenueTotalEuro: euro(revenues.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        vatZeroRows: vatZero.length,
        vatZeroTotalEuro: euro(vatZeroTotalCents),
        fase4PayoutTargets: fase4Targets.length,
        fase4PayoutTargetEuro: euro(fase4Sum),
        overlapVatZeroWithFase4Targets: overlapWithFase4.length,
        overlapEuro: euro(overlapWithFase4.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        residualVatZeroRows: residual.length,
        residualVatZeroEuro: euro(residual.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        residualBySource: Object.fromEntries(
            Object.entries(residualBySource).map(([k, v]) => [
                k,
                { count: v.count, euro: euro(v.totalCents) },
            ])
        ),
    };
}

async function main() {
    console.log('[audit-pre-fase4] start');
    const [costExcess, quarantine, vatZero] = await Promise.all([
        measureCostExcess(),
        measureQuarantineImpact(),
        measureVatZeroRevenues(),
    ]);

    const reversed = await prisma.financialLedgerEntry.groupBy({
        by: ['sourceType'],
        where: { reversedAt: { not: null } },
        _count: true,
    });
    const reversedMeta = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: { not: null } },
        select: { reversedAt: true, metadataJson: true },
    });
    const byDay: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    for (const r of reversedMeta) {
        const day = r.reversedAt!.toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
        const reason = String(
            ((r.metadataJson || {}) as Record<string, unknown>).sanitizeReason || 'UNKNOWN'
        );
        byReason[reason] = (byReason[reason] || 0) + 1;
    }

    const report = {
        generatedAt: new Date().toISOString(),
        point2_reversed: {
            count: reversedMeta.length,
            bySourceType: Object.fromEntries(reversed.map((r) => [r.sourceType, r._count])),
            byDay,
            byReason,
            rootCause:
                'sanitizeLedgerDoubleEntryAnomalies + sanitizePaypalLedgerDuplicates invocati su GET historical-ledger e GET sync/gateways (e sync POST). Peak 2026-08-24T19Z (199) e 2026-08-31T14Z (72).',
        },
        point3_costExcessNet: costExcess,
        point4_quarantine: quarantine,
        point5_vatZeroRevenues: vatZero,
    };

    console.log(JSON.stringify(report, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
