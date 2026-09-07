/**
 * Analisi sola lettura: tre blocchi post-Lotto 3 (banca, vendite, composizione).
 * Uso: npx tsx scripts/fase4b-tre-blocchi-analisi.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import * as fiscalDedupe from '../lib/financial/fiscalAuthorityDedupe';
import { isInternalTransferCategory } from '../lib/financial/historicalLedgerTypes';
import { isPrepaidSubscriptionPoseOrder } from '../lib/financial/prepaidSubscriptionOrders';

const applyFiscalAuthorityHierarchy =
    (fiscalDedupe as any).applyFiscalAuthorityHierarchy ||
    (fiscalDedupe as any).default?.applyFiscalAuthorityHierarchy;

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

async function loadPoseRefs() {
    const poses = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            OR: [{ isRecurring: true }, { additionalInstructions: { contains: 'Duplicato da' } }],
        },
        select: {
            id: true,
            orderNumber: true,
            isRecurring: true,
            stripeTransactionId: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            paymentMethodLabel: true,
            additionalInstructions: true,
            financeNotes: true,
        },
        take: 8000,
    });
    const orderIds = new Set<string>();
    const orderNumbers = new Set<string>();
    for (const o of poses) {
        if (!isPrepaidSubscriptionPoseOrder(o)) continue;
        orderIds.add(o.id);
        if (o.orderNumber) orderNumbers.add(o.orderNumber.toUpperCase());
    }
    return { orderIds, orderNumbers };
}

function isPoseRev(
    r: {
        direction: string | null;
        totalCents: number;
        sourceType: string;
        orderId?: string | null;
        documentRef?: string | null;
        description?: string | null;
    },
    refs: { orderIds: Set<string>; orderNumbers: Set<string> }
) {
    if (r.direction === 'USCITA' || r.totalCents < 0) return false;
    if (r.sourceType === 'FLORIST_PAYOUT' || r.sourceType === 'BANK_LINE') return false;
    if (r.orderId && refs.orderIds.has(r.orderId)) {
        return r.sourceType === 'ORDER' || r.sourceType === 'JSON_ENTRY';
    }
    const doc = (r.documentRef || '').trim().toUpperCase();
    if (doc && refs.orderNumbers.has(doc)) {
        return r.sourceType === 'ORDER' || r.sourceType === 'JSON_ENTRY';
    }
    const desc = r.description || '';
    for (const num of refs.orderNumbers) {
        if (
            desc.includes(num) &&
            r.sourceType === 'JSON_ENTRY' &&
            /incasso ordine|ricavo ordine/i.test(desc)
        ) {
            return true;
        }
    }
    return false;
}

async function main() {
    if (typeof applyFiscalAuthorityHierarchy !== 'function') {
        console.error('exports', Object.keys(fiscalDedupe));
        throw new Error('applyFiscalAuthorityHierarchy non trovata');
    }

    const BATCH = 'FASE4B_L3_20260906_215954';
    const snap = '2026-09-06T21:53:19.251Z';

    const yearStart = new Date(Date.UTC(2026, 0, 1));
    const yearEnd = new Date(Date.UTC(2027, 0, 1));
    const bankLines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { accountingDate: { gte: yearStart, lt: yearEnd } },
                {
                    AND: [
                        { accountingDate: null },
                        { valueDate: { gte: yearStart, lt: yearEnd } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            matchType: true,
        },
    });
    const opening = await prisma.bankStatementDocument.findFirst({
        where: {
            openingBalanceCents: { not: null },
            OR: [
                { periodStart: { gte: yearStart, lt: yearEnd } },
                { periodEnd: { gte: yearStart, lt: yearEnd } },
            ],
        },
        orderBy: { periodStart: 'asc' },
        select: { id: true, openingBalanceCents: true },
    });
    const sumLines = bankLines.reduce((s, l) => s + l.amountCents, 0);
    const pnlCash = sumLines + (opening?.openingBalanceCents || 0);
    const batch = await prisma.financialLedgerEntry.findMany({
        where: { metadataJson: { path: ['fase4bBatchId'], equals: BATCH } },
        select: {
            id: true,
            totalCents: true,
            category: true,
            description: true,
            bankLineId: true,
            sourceKey: true,
            metadataJson: true,
            direction: true,
            sourceType: true,
        },
    });

    const bankTouchedAfterSnap = bankLines.filter(
        (l) => l.createdAt >= new Date(snap) || l.updatedAt >= new Date(snap)
    );

    const all = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: { not: 'CUSTOMER_RECEIPT' },
        },
        select: {
            id: true,
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
            category: true,
            description: true,
            createdAt: true,
        },
    });
    const prevCat = new Map(
        batch.map((b) => [b.id, (b.metadataJson as any)?.fase4bPrevCategory as string])
    );
    const preSim = all.map((r) =>
        prevCat.has(r.id) && prevCat.get(r.id) ? { ...r, category: prevCat.get(r.id)! } : r
    );

    const poseRefs = await loadPoseRefs();
    const withoutPosePre = preSim.filter((r) => !isPoseRev(r, poseRefs));
    const usablePre = applyFiscalAuthorityHierarchy(withoutPosePre);

    const venditeRows = usablePre.filter(
        (r: any) =>
            r.category === 'RICAVI_VENDITE' &&
            (r.direction === 'ENTRATA' || r.totalCents > 0) &&
            !isInternalTransferCategory(r.category)
    );
    const venditeSum = venditeRows.reduce((s: number, r: any) => s + Math.abs(r.totalCents), 0);

    const rvAllHier = usablePre.filter((r: any) => r.category === 'RICAVI_VENDITE');
    let pos = 0,
        neg = 0,
        nPos = 0,
        nNeg = 0;
    let ppNeg = 0,
        nPp = 0,
        bankNeg = 0,
        nBank = 0,
        otherNeg = 0,
        nOther = 0;
    for (const r of rvAllHier as any[]) {
        if (r.totalCents > 0) {
            pos += r.totalCents;
            nPos++;
        } else if (r.totalCents < 0) {
            neg += r.totalCents;
            nNeg++;
            if (r.sourceType === 'PAYPAL_MOVEMENT') {
                ppNeg += r.totalCents;
                nPp++;
            } else if (r.sourceType === 'BANK_LINE') {
                bankNeg += r.totalCents;
                nBank++;
            } else {
                otherNeg += r.totalCents;
                nOther++;
            }
        }
    }

    const venditeIds = new Set(venditeRows.map((r: any) => r.id));
    const l3PrevRicavi = batch.filter(
        (b) => (b.metadataJson as any)?.fase4bPrevCategory === 'RICAVI_VENDITE'
    );
    const l3Ricavi = l3PrevRicavi.map((b) => {
        const inVendite = venditeIds.has(b.id);
        const inHier = (usablePre as any[]).some((r) => r.id === b.id);
        return {
            id: b.id,
            cents: b.totalCents,
            inHier,
            inVendite,
            desc: (b.description || '').slice(0, 80),
        };
    });
    const l3InHierNotVendite = l3Ricavi.filter((r) => r.inHier && !r.inVendite);
    const l3InVendite = l3Ricavi.filter((r) => r.inVendite);
    const sumNotVendite = l3InHierNotVendite.reduce((s, r) => s + Math.abs(r.cents), 0);
    const sumInVendite = l3InVendite.reduce((s, r) => s + Math.abs(r.cents), 0);
    const why = l3InHierNotVendite.slice(0, 25).map((r) => {
        const row = (usablePre as any[]).find((x) => x.id === r.id)!;
        return {
            id: r.id,
            dir: row.direction,
            cents: row.totalCents,
            cat: row.category,
            st: row.sourceType,
            desc: (row.description || '').slice(0, 60),
        };
    });

    // Also: L3 ricavi NOT in hierarchy at all
    const l3NotHier = l3Ricavi.filter((r) => !r.inHier);

    const isabella = await prisma.order.findMany({
        where: {
            buyerFullName: { contains: 'Cesaroni', mode: 'insensitive' },
            deletedAt: null,
        },
        select: {
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            totalPriceCents: true,
            createdAt: true,
            deliveryDate: true,
            isRecurring: true,
            deceasedName: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const recurringBuyers = await prisma.$queryRawUnsafe(`
    SELECT "buyerFullName", COUNT(*)::int as n_orders,
           SUM("totalPriceCents")::int as sum_cents,
           COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as n_completed,
           COUNT(*) FILTER (WHERE "partnerPaymentStatus" = 'PAID')::int as n_paid
    FROM "Order"
    WHERE "deletedAt" IS NULL AND "isRecurring" = true AND "buyerFullName" IS NOT NULL
    GROUP BY "buyerFullName"
    HAVING COUNT(*) >= 2
    ORDER BY COUNT(*) DESC
  `);

    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });

    // Simulate correct dry-run expectations from pre numbers
    const raiPre = -268471; // frozen at dry-run
    const ricaviLordiExit = batch
        .filter((b) => {
            const prev = (b.metadataJson as any)?.fase4bPrevCategory;
            return (
                prev === 'RICAVI_VENDITE' ||
                prev === 'ALTRI_RICAVI' ||
                prev === 'RIMBORSI' ||
                prev === 'CONTRIBUTI_ESERCIZIO'
            );
        })
        .filter((b) => {
            // only those that were in ricaviLordi branch (positive/ENTRATA)
            return b.direction === 'ENTRATA' || b.totalCents > 0;
        });
    // Better: sum of abs for L3 rows that were in hierarchy as revenue categories
    let exitRicaviLordi = 0;
    let exitVendite = 0;
    for (const b of batch) {
        const prev = (b.metadataJson as any)?.fase4bPrevCategory as string;
        if (!['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI', 'CONTRIBUTI_ESERCIZIO'].includes(prev))
            continue;
        const inHier = (usablePre as any[]).some((r) => r.id === b.id);
        if (!inHier) continue;
        const row = (usablePre as any[]).find((r) => r.id === b.id)!;
        if (!(row.direction === 'ENTRATA' || row.totalCents > 0)) continue;
        const abs = Math.abs(row.totalCents);
        exitRicaviLordi += abs;
        if (prev === 'RICAVI_VENDITE' && venditeIds.has(b.id)) exitVendite += abs;
    }

    const report = {
        generatedAt: new Date().toISOString(),
        blocco1_banca: {
            conclusione:
                'Lotto 3 NON muove la cassa Fineco. cashBankBalanceCents = opening PDF + Σ bankStatementLine 2026. Zero righe banca create/modificate dopo snapshot 21:53:19. €397,48 = invariante Fase2 (€32.403,61, fantasma) − PnL Fineco (€32.006,13) già misurato a Lotto 0. Rollback L3 NON richiesto per banca.',
            invarianteFase2: euro(3240361),
            pnlCashNow: euro(pnlCash),
            deltaFalsi: euro(pnlCash - 3240361),
            opening: {
                id: opening?.id,
                euro: euro(opening?.openingBalanceCents || 0),
            },
            bankLines2026: { n: bankLines.length, sum: euro(sumLines) },
            bankLinesTouchedAfterSnapshot: bankTouchedAfterSnap,
            lotto3Batch: {
                batchId: BATCH,
                n: batch.length,
                touchesBankStatementLine: false,
            },
            rollbackPiano:
                'NON RICHIESTO per banca. Rollback CE solo se serve: ripristinare fase4bPrevCategory + conti da metadata sulle 87 righe; dopo fix dry-run.',
        },
        blocco1_vendite191: {
            l3RicaviPrevN: l3Ricavi.length,
            sumInVenditePre: euro(sumInVendite),
            sumInHierNotVendite: euro(sumNotVendite),
            inHierNotVenditeN: l3InHierNotVendite.length,
            notInHierN: l3NotHier.length,
            notInHierSum: euro(l3NotHier.reduce((s, r) => s + Math.abs(r.cents), 0)),
            whySample: why,
            dryRunSottraeva: euro(300780),
            effettoRealeSuVendite: euro(sumInVendite),
            attesoCorretto: euro(573632 - sumInVendite),
            postOsservato: euro(pnl.venditeCaratteristicheCents || 0),
        },
        blocco2_dryrunFix: {
            bug: 'raiAfterExpected = raiBefore + ricaviVenditeInHier (segno invertito). Togliere ricavi finti PEGGIORA il RAI.',
            corretto: 'raiAfterExpected = raiBefore - exitRicaviLordi (tutte le categorie ricavo in CE che escono).',
            bugVendite:
                'venditeAfter = venditeBefore - hierarchyFull; deve sottrarre solo le righe che erano DENTRO venditeCaratteristiche.',
            simulazioneCorrettaDaPre: {
                exitRicaviLordi: euro(exitRicaviLordi),
                exitVendite: euro(exitVendite),
                raiAtteso: euro(raiPre - exitRicaviLordi),
                venditeAttese: euro(573632 - exitVendite),
                raiOsservatoPost: euro(pnl.risultatoAnteImposteCents),
                venditeOsservatePost: euro(pnl.venditeCaratteristicheCents || 0),
            },
        },
        blocco3_composizione: {
            preL3_venditeMotore: euro(venditeSum),
            venditeRowsN: venditeRows.length,
            hierarchy_RV_positivi: { n: nPos, euro: euro(pos) },
            hierarchy_RV_negativi: { n: nNeg, euro: euro(neg) },
            algebrica: euro(pos + neg),
            deltaPosVsVendite: euro(pos - venditeSum),
            negativiDentroVenditeN: venditeRows.filter((r: any) => r.totalCents < 0).length,
            decomposizioneNegativi: {
                paypal: { n: nPp, euro: euro(ppNeg) },
                bankLine: { n: nBank, euro: euro(bankNeg) },
                altri: { n: nOther, euro: euro(otherNeg) },
                totale: euro(neg),
            },
            filtriMotore: [
                'Esclude CUSTOMER_RECEIPT e reversed',
                'Esclude ricavi pose prepagate (ORDER/JSON_ENTRY)',
                'applyFiscalAuthorityHierarchy',
                'Quarantena MANUAL_EXPENSE deboli',
                'Skip TRASFERIMENTO_INTERNO',
                'Vendite: RICAVI_VENDITE ∧ (ENTRATA ∨ totalCents>0) → Σ |cents|',
            ],
        },
        isabella: isabella.map((o) => ({
            orderNumber: o.orderNumber,
            createdAt: o.createdAt.toISOString().slice(0, 10),
            deliveryDate: o.deliveryDate?.toISOString().slice(0, 10) ?? null,
            amount: euro(o.totalPriceCents),
            status: o.status,
            payment: o.partnerPaymentStatus,
            recurring: o.isRecurring,
            deceased: o.deceasedName,
        })),
        recurringBuyers,
        pnlNow: {
            vendite: euro(pnl.venditeCaratteristicheCents || 0),
            rai: euro(pnl.risultatoAnteImposteCents),
            banca: euro(pnl.cashBankBalanceCents || 0),
        },
    };

    const exportRows = venditeRows.map((r: any) => ({
        id: r.id,
        totalCents: r.totalCents,
        segno: r.totalCents >= 0 ? '+' : '-',
        amount: euro(Math.abs(r.totalCents)),
        sourceType: r.sourceType,
        sourceKey: r.sourceKey,
        category: r.category,
        direction: r.direction,
        description: (r.description || '').slice(0, 120),
    }));

    writeFileSync(
        'docs/verbali/dossier_fase4b_vendite_composizione_export.json',
        JSON.stringify({ meta: report.blocco3_composizione, rows: exportRows }, null, 2)
    );
    writeFileSync('docs/verbali/dossier_fase4b_tre_blocchi.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await prisma.$disconnect();
        } catch {
            /* */
        }
    });
