/**
 * Fase 4b — Lotto 2 ESECUZIONE: riclassifica contributo CCIAA.
 * ALTRI_RICAVI → CONTRIBUTI_ESERCIZIO (non storno).
 *
 * Uso: npx tsx scripts/fase4b-lotto2-execute.ts
 * Flag: --dry-run (default false: esegue write)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { dryRunClassifyBankLine } from '../lib/financial/payoutClassification';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';
import { ACCOUNT_CONTRIBUTI_ESERCIZIO } from '../lib/financial/chartOfAccounts';

const ENTRY_ID = 'cmt3zx44k00e9ky04exlfxeyg';
const EXPECTED_CENTS = 459_766;
const EXPECTED_VENDITE = 593_214;
const EXPECTED_RAI = -218_471;

function euro(cents: number): string {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function batchIdNow(): string {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `FASE4B_L2_${y}${m}${day}_${hh}${mm}${ss}`;
}

async function measureRevenueMix(fiscalYear: number) {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            category: true,
            totalCents: true,
            direction: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            bankLineId: true,
            vatCents: true,
            netCents: true,
            accountingDate: true,
            metadataJson: true,
        },
    });
    const usable = applyFiscalAuthorityHierarchy(rows);
    const mix: Record<string, { n: number; cents: number }> = {};
    for (const r of usable) {
        if (!(r.direction === 'ENTRATA' || r.totalCents > 0)) continue;
        const cat = r.category;
        if (!mix[cat]) mix[cat] = { n: 0, cents: 0 };
        mix[cat].n += 1;
        mix[cat].cents += Math.abs(r.totalCents);
    }
    return mix;
}

/** Propedeutico Lotto 3: split payout matched per categoria. */
async function payoutCategorySplit() {
    const revenueBank = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'BANK_LINE',
            category: { in: ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI', 'CONTRIBUTI_ESERCIZIO'] },
        },
        select: {
            id: true,
            totalCents: true,
            category: true,
            bankLineId: true,
            sourceId: true,
            fiscalYear: true,
            description: true,
        },
    });

    const byCat: Record<string, { n: number; cents: number; ids: string[] }> = {};
    let totalCents = 0;
    let totalN = 0;

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
        totalN += 1;
        totalCents += Math.abs(r.totalCents);
        if (!byCat[r.category]) byCat[r.category] = { n: 0, cents: 0, ids: [] };
        byCat[r.category].n += 1;
        byCat[r.category].cents += Math.abs(r.totalCents);
        byCat[r.category].ids.push(r.id);
    }

    return { totalN, totalCents, byCat };
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const batchId = batchIdNow();

    console.log(JSON.stringify({ phase: 'start', dryRun, batchId, entryId: ENTRY_ID }));

    const before = await prisma.financialLedgerEntry.findUnique({
        where: { id: ENTRY_ID },
        select: {
            id: true,
            category: true,
            totalCents: true,
            vatCents: true,
            description: true,
            metadataJson: true,
            reversedAt: true,
            fiscalYear: true,
        },
    });

    if (!before) throw new Error(`Entry ${ENTRY_ID} not found`);
    if (before.reversedAt) throw new Error(`Entry ${ENTRY_ID} already reversed`);
    if (before.totalCents !== EXPECTED_CENTS) {
        throw new Error(`Amount mismatch: got ${before.totalCents}, expected ${EXPECTED_CENTS}`);
    }
    if (before.category !== 'ALTRI_RICAVI' && before.category !== 'CONTRIBUTI_ESERCIZIO') {
        throw new Error(`Unexpected category: ${before.category}`);
    }

    const pnlBefore = await computeHistoricalPnl({ fiscalYear: 2026 });
    const mixBefore = await measureRevenueMix(2026);

    console.log(
        JSON.stringify(
            {
                phase: 'pre',
                category: before.category,
                amount: euro(before.totalCents),
                pnl: {
                    vendite: euro(pnlBefore.venditeCaratteristicheCents ?? 0),
                    altri: euro(pnlBefore.altriRicaviCents ?? 0),
                    contributi: euro(pnlBefore.contributiEsercizioCents ?? 0),
                    ricaviLordi: euro(pnlBefore.ricaviLordiCents),
                    rai: euro(pnlBefore.risultatoAnteImposteCents),
                },
                mixBefore,
            },
            null,
            2
        )
    );

    if (before.category === 'CONTRIBUTI_ESERCIZIO') {
        console.log(JSON.stringify({ phase: 'skip', reason: 'already reclassified' }));
    } else if (!dryRun) {
        const prevMeta =
            before.metadataJson && typeof before.metadataJson === 'object' && !Array.isArray(before.metadataJson)
                ? (before.metadataJson as Record<string, unknown>)
                : {};

        await prisma.financialLedgerEntry.update({
            where: { id: ENTRY_ID },
            data: {
                category: 'CONTRIBUTI_ESERCIZIO',
                metadataJson: {
                    ...prevMeta,
                    avereAccount: ACCOUNT_CONTRIBUTI_ESERCIZIO,
                    fase4bBatchId: batchId,
                    fase4bLotto: 2,
                    fase4bAction: 'RECLASS',
                    fase4bPrevCategory: 'ALTRI_RICAVI',
                    fase4bPrevAvereAccount: prevMeta.avereAccount ?? null,
                    fase4bExecutedAt: new Date().toISOString(),
                },
            },
        });
        console.log(JSON.stringify({ phase: 'written', batchId, category: 'CONTRIBUTI_ESERCIZIO' }));
    } else {
        console.log(JSON.stringify({ phase: 'dry-run-skip-write' }));
    }

    const after = await prisma.financialLedgerEntry.findUnique({
        where: { id: ENTRY_ID },
        select: { id: true, category: true, totalCents: true, metadataJson: true },
    });
    const pnlAfter = await computeHistoricalPnl({ fiscalYear: 2026 });
    const mixAfter = await measureRevenueMix(2026);
    const payouts = await payoutCategorySplit();

    const vendite = pnlAfter.venditeCaratteristicheCents ?? 0;
    const altri = pnlAfter.altriRicaviCents ?? 0;
    const contributi = pnlAfter.contributiEsercizioCents ?? 0;
    const rai = pnlAfter.risultatoAnteImposteCents;

    const ok =
        vendite === EXPECTED_VENDITE &&
        rai === EXPECTED_RAI &&
        contributi === EXPECTED_CENTS &&
        (!dryRun ? after?.category === 'CONTRIBUTI_ESERCIZIO' : true);

    const ricaviInVendite = payouts.byCat['RICAVI_VENDITE']?.cents ?? 0;
    const ricaviInAltri = payouts.byCat['ALTRI_RICAVI']?.cents ?? 0;
    const venditeDopoLotto3 = vendite - ricaviInVendite;

    const report = {
        phase: 'post',
        ok,
        batchId: dryRun ? null : batchId,
        rowsTouched: dryRun ? 0 : before.category === 'CONTRIBUTI_ESERCIZIO' ? 0 : 1,
        entry: {
            id: ENTRY_ID,
            category: after?.category,
            amount: euro(after?.totalCents ?? 0),
        },
        postExecution: {
            venditeCaratteristiche: euro(vendite),
            altriRicavi: euro(altri),
            contributiEsercizio: euro(contributi),
            risultatoAnteImposte: euro(rai),
            ricaviLordi: euro(pnlAfter.ricaviLordiCents),
        },
        expected: {
            venditeCaratteristiche: euro(EXPECTED_VENDITE),
            risultatoAnteImposte: euro(EXPECTED_RAI),
            contributiEsercizio: euro(EXPECTED_CENTS),
        },
        mixAfter,
        propedeuticoLotto3: {
            payoutRows: payouts.totalN,
            payoutTotal: euro(payouts.totalCents),
            byCategory: Object.fromEntries(
                Object.entries(payouts.byCat).map(([k, v]) => [
                    k,
                    { n: v.n, euro: euro(v.cents), cents: v.cents },
                ])
            ),
            inRicaviVendite: euro(ricaviInVendite),
            inAltriRicavi: euro(ricaviInAltri),
            venditeCaratteristicheAtteseDopoLotto3: euro(venditeDopoLotto3),
            nota:
                ricaviInVendite > 0
                    ? `Dopo storno Lotto 3 le vendite scenderebbero a ${euro(venditeDopoLotto3)}`
                    : 'I payout non sono in RICAVI_VENDITE: le vendite resterebbero invariate',
        },
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok && !dryRun) {
        process.exitCode = 2;
        console.error('[fase4b-l2] VERIFICATION FAILED');
    }
}

main()
    .catch((err) => {
        console.error('[fase4b-l2] FATAL', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
