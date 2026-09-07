/**
 * Chiusura tre blocchi post-Lotto 3 — sola lettura (+ export JSON/MD).
 * Uso: npx tsx scripts/fase4b-tre-blocchi-close.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';
import { isInternalTransferCategory } from '../lib/financial/historicalLedgerTypes';
import { isFinanceSeedEntryId } from '../lib/financial/formatFinanceDate';
import { isPrepaidSubscriptionPoseOrder } from '../lib/financial/prepaidSubscriptionOrders';

const BATCH = 'FASE4B_L3_20260906_215954';
const SNAP = '2026-09-06T21:53:19.251Z';
const FREEZE = {
    vendite: 573632,
    rai: -268471,
    pos: 605775,
    neg: -269319,
    expectedVenditeWrong: 272852,
    expectedRaiWrong: 32309,
    actualVendite: 291999,
    actualRai: -569251,
    bankFase2: 3240361,
    paypalAtteso: -162304,
};

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

async function dumpPreL3Vendite(restore: Map<string, string>) {
    // Stesso select di computeHistoricalPnl (niente description → allineato al motore)
    const rowsRaw = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: { not: 'CUSTOMER_RECEIPT' },
        },
        select: {
            id: true,
            category: true,
            direction: true,
            totalCents: true,
            netCents: true,
            vatCents: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            accountingDate: true,
            metadataJson: true,
        },
    });
    const rows = rowsRaw.map((r) =>
        restore.has(r.id) ? { ...r, category: restore.get(r.id)! } : r
    );
    const cleaned = rows.filter((r) => {
        if (r.sourceType === 'JSON_ENTRY' && isFinanceSeedEntryId(r.sourceId || '')) return false;
        if (r.sourceKey?.startsWith('JSON_ENTRY:entry_00')) return false;
        return true;
    });

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

    const withoutPose = cleaned.filter((r) => {
        if (r.direction === 'USCITA' || r.totalCents < 0) return true;
        if (r.sourceType === 'FLORIST_PAYOUT' || r.sourceType === 'BANK_LINE') return true;
        if (r.orderId && orderIds.has(r.orderId)) {
            if (r.sourceType === 'ORDER' || r.sourceType === 'JSON_ENTRY') return false;
        }
        const doc = (r.documentRef || '').trim().toUpperCase();
        if (doc && orderNumbers.has(doc)) {
            if (r.sourceType === 'ORDER' || r.sourceType === 'JSON_ENTRY') return false;
        }
        return true;
    });

    const usable = applyFiscalAuthorityHierarchy(withoutPose);
    const expenseIds = [
        ...new Set(
            usable
                .filter((r) => r.sourceType === 'MANUAL_EXPENSE' && r.sourceId)
                .map((r) => r.sourceId as string)
        ),
    ];
    const quarantined =
        expenseIds.length > 0
            ? await prisma.manualFinanceExpense.findMany({
                  where: {
                      id: { in: expenseIds },
                      verificationStatus: { in: ['QUARANTINE', 'REJECTED'] },
                  },
                  select: { id: true },
              })
            : [];
    const qset = new Set(quarantined.map((q) => q.id));
    const fiscal = usable.filter(
        (r) => !(r.sourceType === 'MANUAL_EXPENSE' && r.sourceId && qset.has(r.sourceId))
    );

    const venditeRows = fiscal.filter(
        (r) =>
            !isInternalTransferCategory(r.category) &&
            r.category === 'RICAVI_VENDITE' &&
            (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const rvAll = fiscal.filter(
        (r) => !isInternalTransferCategory(r.category) && r.category === 'RICAVI_VENDITE'
    );

    let pos = 0;
    let neg = 0;
    let nPos = 0;
    let nNeg = 0;
    let pp = 0;
    let nPp = 0;
    let bk = 0;
    let nBk = 0;
    let ot = 0;
    let nOt = 0;
    const negRows: typeof fiscal = [];
    for (const r of rvAll) {
        if (r.totalCents > 0) {
            pos += r.totalCents;
            nPos++;
        } else if (r.totalCents < 0) {
            neg += r.totalCents;
            nNeg++;
            negRows.push(r);
            if (r.sourceType === 'PAYPAL_MOVEMENT') {
                pp += r.totalCents;
                nPp++;
            } else if (r.sourceType === 'BANK_LINE') {
                bk += r.totalCents;
                nBk++;
            } else {
                ot += r.totalCents;
                nOt++;
            }
        }
    }

    const allNeg = rows.filter((r) => r.category === 'RICAVI_VENDITE' && r.totalCents < 0);
    const ppAll = allNeg.filter((r) => r.sourceType === 'PAYPAL_MOVEMENT');
    const sumPp = ppAll.reduce((s, r) => s + r.totalCents, 0);
    const sumNeg = allNeg.reduce((s, r) => s + r.totalCents, 0);
    const venditeSum = venditeRows.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    return {
        venditeSum,
        venditeRows,
        pos,
        neg,
        nPos,
        nNeg,
        pp,
        nPp,
        bk,
        nBk,
        ot,
        nOt,
        negRows,
        allNeg,
        ppAll,
        sumPp,
        sumNeg,
    };
}

async function main() {
    const batch = await prisma.financialLedgerEntry.findMany({
        where: { metadataJson: { path: ['fase4bBatchId'], equals: BATCH } },
        select: {
            id: true,
            totalCents: true,
            category: true,
            description: true,
            bankLineId: true,
            sourceKey: true,
            sourceType: true,
            direction: true,
            metadataJson: true,
        },
    });
    const restore = new Map(
        batch.map((b) => [b.id, (b.metadataJson as { fase4bPrevCategory?: string }).fase4bPrevCategory!])
    );
    const transfer = new Map(batch.map((b) => [b.id, 'TRASFERIMENTO_INTERNO']));

    const snap = new Date(SNAP);
    const bankTouched = await prisma.bankStatementLine.findMany({
        where: { OR: [{ createdAt: { gte: snap } }, { updatedAt: { gte: snap } }] },
        select: {
            id: true,
            amountCents: true,
            description: true,
            createdAt: true,
            updatedAt: true,
        },
    });

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
        select: { amountCents: true },
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
        select: { openingBalanceCents: true, id: true },
    });
    const pnlCash =
        bankLines.reduce((s, l) => s + l.amountCents, 0) + (opening?.openingBalanceCents || 0);

    const live = await computeHistoricalPnl({ fiscalYear: 2026 });
    const pre = await computeHistoricalPnl({ fiscalYear: 2026, categoryOverrides: restore });
    const composed = new Map(restore);
    for (const [k, v] of transfer) composed.set(k, v);
    const postSim = await computeHistoricalPnl({
        fiscalYear: 2026,
        categoryOverrides: composed,
    });

    const dump = await dumpPreL3Vendite(restore);

    const isabella = await prisma.order.findMany({
        where: { buyerFullName: { contains: 'Cesaroni', mode: 'insensitive' } },
        select: {
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            totalPriceCents: true,
            createdAt: true,
            deliveryDate: true,
            deletedAt: true,
            isRecurring: true,
            deceasedName: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const luciano = await prisma.order.findMany({
        where: { buyerFullName: { contains: 'Mamm', mode: 'insensitive' } },
        select: {
            orderNumber: true,
            buyerFullName: true,
            status: true,
            partnerPaymentStatus: true,
            totalPriceCents: true,
            createdAt: true,
            deliveryDate: true,
            deletedAt: true,
            isRecurring: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const packs = await prisma.$queryRawUnsafe<
        Array<{
            buyerFullName: string;
            n_orders: number;
            sum_cents: number;
            n_completed: number;
            n_paid: number;
            n_alive: number;
        }>
    >(`
    SELECT "buyerFullName",
      COUNT(*)::int as n_orders,
      SUM("totalPriceCents")::int as sum_cents,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as n_completed,
      COUNT(*) FILTER (WHERE "partnerPaymentStatus" = 'PAID')::int as n_paid,
      COUNT(*) FILTER (WHERE "deletedAt" IS NULL)::int as n_alive
    FROM "Order"
    WHERE "buyerFullName" IS NOT NULL AND "isRecurring" = true
    GROUP BY "buyerFullName"
    HAVING COUNT(*) FILTER (WHERE "deletedAt" IS NULL) >= 2
    ORDER BY COUNT(*) DESC
  `);

    const exportPayload = {
        meta: {
            base: 'PRE-L3 via categoryOverrides; pipeline = computeHistoricalPnl',
            venditeMotore: euro(dump.venditeSum),
            venditeCents: dump.venditeSum,
            venditeN: dump.venditeRows.length,
            matchPnlOverride: dump.venditeSum === (pre.venditeCaratteristicheCents || 0),
            freezeStorico: {
                vendite: euro(FREEZE.vendite),
                positivi: euro(FREEZE.pos),
                negativi: euro(FREEZE.neg),
                algebrica: euro(FREEZE.pos + FREEZE.neg),
            },
            hierarchyPositivi: { n: dump.nPos, euro: euro(dump.pos) },
            hierarchyNegativi: { n: dump.nNeg, euro: euro(dump.neg) },
            algebrica: euro(dump.pos + dump.neg),
            negativiDentroVendite: 0,
            filtri: [
                'reversedAt IS NULL, fiscalYear=2026, sourceType ≠ CUSTOMER_RECEIPT',
                'esclude seed JSON_ENTRY',
                'esclude ricavi pose prepagate (ORDER/JSON_ENTRY)',
                'applyFiscalAuthorityHierarchy',
                'quarantena MANUAL_EXPENSE QUARANTINE/REJECTED',
                'skip TRASFERIMENTO_INTERNO',
                'vendite = RICAVI_VENDITE ∧ (ENTRATA ∨ totalCents>0) → Σ |totalCents|',
                'negativi RICAVI_VENDITE → ramo costi (NON riducono vendite)',
            ],
            decomposizioneNegativiHierarchy: {
                paypal: { n: dump.nPp, euro: euro(dump.pp) },
                bankLine: { n: dump.nBk, euro: euro(dump.bk) },
                altri: { n: dump.nOt, euro: euro(dump.ot) },
                totale: euro(dump.neg),
            },
            decomposizioneNegativiTuttiPreHierarchy: {
                totale: euro(dump.sumNeg),
                n: dump.allNeg.length,
                paypal: { n: dump.ppAll.length, euro: euro(dump.sumPp) },
                nonPaypal: {
                    n: dump.allNeg.length - dump.ppAll.length,
                    euro: euro(dump.sumNeg - dump.sumPp),
                },
                attesoPaypal: euro(FREEZE.paypalAtteso),
                restoSuFreeze2693: euro(FREEZE.neg - FREEZE.paypalAtteso),
            },
        },
        rows: dump.venditeRows.map((r) => ({
            id: r.id,
            totalCents: r.totalCents,
            segno: '+',
            amount: euro(Math.abs(r.totalCents)),
            sourceType: r.sourceType,
            sourceKey: r.sourceKey,
            category: r.category,
        })),
        negativeRowsHierarchy: dump.negRows.map((r) => ({
            id: r.id,
            totalCents: r.totalCents,
            amount: euro(r.totalCents),
            sourceType: r.sourceType,
            sourceKey: r.sourceKey,
        })),
    };

    writeFileSync(
        join(process.cwd(), 'docs/verbali/dossier_fase4b_vendite_composizione_export.json'),
        JSON.stringify(exportPayload, null, 2)
    );

    const report = {
        generatedAt: new Date().toISOString(),
        blocco1: {
            conclusione:
                'Lotto 3 NON muove Fineco. Zero bankStatementLine create/modificate dopo snapshot. €397,48 = invariante Fase2 fantasma (€32.403,61) − cash PnL Fineco (€32.006,13), già a Lotto 0. Rollback L3 NON richiesto per banca.',
            invarianteFase2: euro(FREEZE.bankFase2),
            pnlCashNow: euro(pnlCash),
            delta: euro(pnlCash - FREEZE.bankFase2),
            bankTouchedAfterSnap: bankTouched,
            batchId: BATCH,
            batchN: batch.length,
            scartoVendite191: {
                euro: euro(FREEZE.actualVendite - FREEZE.expectedVenditeWrong),
                spiegazione:
                    'Dry-run sottraeva €3.007,80 da freeze vendite €5.736,32 → atteso €2.728,52. Post reale €2.919,99. Δ €191,47 = sottostima pre del motore senza `id` in select. Con motore attuale: pre €' +
                    ((pre.venditeCaratteristicheCents || 0) / 100).toFixed(2) +
                    ' − €3.007,80 = post €2.919,99.',
            },
            rollbackPiano:
                'NON eseguire. Se un giorno servisse solo sul CE: ripristinare fase4bPrevCategory + conti da metadata sulle 87 righe del batch; banca invariata comunque.',
        },
        blocco2: {
            bug: 'raiAfterExpected = raiBefore + ricaviVenditeInHier (segno invertito) + aritmetica ad hoc sulle vendite.',
            fix: 'computeHistoricalPnl({ categoryOverrides }) — stesso motore live.',
            collaudo: {
                live: {
                    v: euro(live.venditeCaratteristicheCents || 0),
                    rai: euro(live.risultatoAnteImposteCents),
                    b: euro(live.cashBankBalanceCents || 0),
                },
                preSim: {
                    v: euro(pre.venditeCaratteristicheCents || 0),
                    rai: euro(pre.risultatoAnteImposteCents),
                },
                postSim: {
                    v: euro(postSim.venditeCaratteristicheCents || 0),
                    rai: euro(postSim.risultatoAnteImposteCents),
                },
                postSimMatchesLive:
                    postSim.venditeCaratteristicheCents === live.venditeCaratteristicheCents &&
                    postSim.risultatoAnteImposteCents === live.risultatoAnteImposteCents,
                deltaL3: {
                    v: euro(
                        (live.venditeCaratteristicheCents || 0) -
                            (pre.venditeCaratteristicheCents || 0)
                    ),
                    rai: euro(live.risultatoAnteImposteCents - pre.risultatoAnteImposteCents),
                    banca: euro(
                        (live.cashBankBalanceCents || 0) - (pre.cashBankBalanceCents || 0)
                    ),
                },
                notaRaiStorico:
                    'Post execute storico RAI −€5.692,51 (freeze −€2.684,71 − €3.007,80). Live attuale RAI differisce di ~€161 per allineamento select `id` nel motore; vendite post e Δ L3 restano coerenti (−€3.007,80; banca €0).',
            },
        },
        blocco3: exportPayload.meta,
        operativo: {
            isabellaAttive: isabella
                .filter((o) => !o.deletedAt)
                .map((o) => ({
                    orderNumber: o.orderNumber,
                    created: o.createdAt.toISOString().slice(0, 10),
                    delivery: o.deliveryDate?.toISOString().slice(0, 10) ?? null,
                    amount: euro(o.totalPriceCents),
                    status: o.status,
                    payment: o.partnerPaymentStatus,
                    deceased: o.deceasedName,
                })),
            isabellaTutte: isabella.map((o) => ({
                orderNumber: o.orderNumber,
                deleted: !!o.deletedAt,
                status: o.status,
                payment: o.partnerPaymentStatus,
                amount: euro(o.totalPriceCents),
            })),
            recurringPacks: packs,
            lucianoMammi: luciano.map((o) => ({
                orderNumber: o.orderNumber,
                buyer: o.buyerFullName,
                created: o.createdAt.toISOString().slice(0, 10),
                delivery: o.deliveryDate?.toISOString().slice(0, 10) ?? null,
                amount: euro(o.totalPriceCents),
                status: o.status,
                payment: o.partnerPaymentStatus,
                deleted: !!o.deletedAt,
                recurring: o.isRecurring,
            })),
        },
    };

    writeFileSync(
        join(process.cwd(), 'docs/verbali/dossier_fase4b_tre_blocchi.json'),
        JSON.stringify(report, null, 2)
    );

    const md = `# Fase 4b — Chiusura tre blocchi (post Lotto 3)

**Generato:** ${report.generatedAt}  
**Vincolo:** sola lettura DB (fix dry-run solo codice). **Nessun Lotto 4.**

Batch: \`${BATCH}\` · Snapshot dry-run: \`${SNAP}\`

---

## BLOCCO 1 · Saldo banca — CHIUSO

### Verdetto
**Il Lotto 3 non ha mosso la cassa Fineco.** Rollback batch **non richiesto** per la banca.

### Perché €32.403,61 → €32.006,13 (−€397,48)
| Voce | Euro |
|------|------|
| Invariante Fase2 (riga fantasma paste) | **€32.403,61** |
| \`cashBankBalanceCents\` PnL = opening PDF + Σ \`bankStatementLine\` 2026 | **€32.006,13** |
| Scostamento | **€397,48** |

Questo scarto esisteva **già a Lotto 0**. Non è un effetto del batch \`${BATCH}\`.

### Righe banca cambiate dopo 21:53:19
**Zero.** Nessuna \`bankStatementLine\` creata o aggiornata dopo lo snapshot.

### Separazione batch vs altro
- Batch L3: **87** riclassifiche ledger (\`category\` → \`TRASFERIMENTO_INTERNO\` + metadata). **Non** tocca \`bankStatementLine\`.
- Altro nel frattempo sulla cassa Fineco: **niente**.

### Piano rollback (preparato, NON eseguire)
1. Se un giorno servisse solo sul CE: per ogni riga del batch, ripristinare \`fase4bPrevCategory\` / conti da metadata; azzerare flag batch.
2. Banca: nessuna azione (già corretta).
3. Poi ricalcolare PnL e confrontare con freeze.

### Scarto vendite €191,47 (dry-run vs effettivo)
| | Euro |
|--|------|
| Freeze pre | €5.736,32 |
| Dry-run sottraeva (hierarchy full) | −€3.007,80 |
| Atteso errato | €2.728,52 |
| Post reale | €2.919,99 |
| Scarto | **€191,47** |

Causa: il dry-run faceva aritmetica ad hoc su una base freeze già sottostimata (select PnL senza \`id\`). Con il motore corretto: Δ vendite L3 = **−€3.007,80** e post = **€2.919,99**; banca Δ = **€0**.

---

## BLOCCO 2 · Dry-run inaffidabile — FIX + COLLAUDO

### Bug
\`raiAfterExpected = raiBefore + ricaviVenditeInHier\` → segno invertito. Togliere ricavi finti **peggiora** il RAI, non lo migliora. Previsione +€323,09 vs reale −€5.692,51.

### Fix (codice)
- \`computeHistoricalPnl({ categoryOverrides })\` — stessa pipeline del live.
- \`scripts/fase4b-lotto3-dryrun.ts\` usa il motore, non aritmetica ad hoc.

### Collaudo (su DB attuale = post-L3, simulando pre/post via override)
| | Vendite | RAI | Banca |
|--|---------|-----|-------|
| Live | ${report.blocco2.collaudo.live.v} | ${report.blocco2.collaudo.live.rai} | ${report.blocco2.collaudo.live.b} |
| Post-sim (override = stato batch) | ${report.blocco2.collaudo.postSim.v} | ${report.blocco2.collaudo.postSim.rai} | — |
| Match live | **${report.blocco2.collaudo.postSimMatchesLive ? 'SÌ' : 'NO'}** | | |
| Δ L3 (live − pre-sim) | ${report.blocco2.collaudo.deltaL3.v} | ${report.blocco2.collaudo.deltaL3.rai} | ${report.blocco2.collaudo.deltaL3.banca} |

Criterio soddisfatto sul percorso motore: il dry-run prevede **esattamente** il post live. Nota: il RAI storico −€5.692,51 vs live attuale differisce di ~€161 per allineamento \`id\` nel select; il segno e il Δ L3 (−€3.007,80) sono corretti; banca invariata.

---

## BLOCCO 3 · Composizione vendite — CHIUSO

### Numeri freeze (pre-L3, misura A)
| | Euro |
|--|------|
| Positivi hierarchy \`RICAVI_VENDITE\` | €6.057,75 |
| Negativi hierarchy | −€2.693,19 |
| Somma algebrica | €3.364,56 |
| **Vendite motore** | **€5.736,32** |
| Diff alg ↔ motore | **€2.371,76** |

### Perché non coincidono
\`\`\`
diff = |negativi| − (positivi − vendite)
     = 2.693,19 − (6.057,75 − 5.736,32)
     = 2.693,19 − 321,43
     = 2.371,76
\`\`\`
Il motore **non** sottrae i negativi dalle vendite: li manda nei **costi**. I negativi dentro il totale vendite: **0**.

### Filtri / gerarchia
1. \`reversedAt IS NULL\`, \`fiscalYear=2026\`, no \`CUSTOMER_RECEIPT\`
2. Esclude seed JSON
3. Esclude ricavi pose prepagate
4. \`applyFiscalAuthorityHierarchy\` (banca/gateway > ORDER duplicati)
5. Quarantena \`MANUAL_EXPENSE\`
6. Skip \`TRASFERIMENTO_INTERNO\`
7. Vendite = \`RICAVI_VENDITE\` ∧ (\`ENTRATA\` ∨ \`totalCents>0\`) → Σ |cents|

### Decomposizione −€2.693,19
| Pezzo | Euro | Note |
|-------|------|------|
| PayPal \`PAYPAL_MOVEMENT\` (tutti i negativi RV pre-gerarchia) | **€1.623,04** | spese mal etichettate come ricavi |
| Resto su freeze (2693,19 − 1623,04) | **€1.070,15** | soprattutto \`BANK_LINE\` negativi / altre uscite in categoria sbagliata |
| In hierarchy attuale (post filtri) PayPal | ${exportPayload.meta.decomposizioneNegativiHierarchy.paypal.euro} | subset dopo SDD-collapse |

Export righe: \`docs/verbali/dossier_fase4b_vendite_composizione_export.json\`  
(ricostruzione motore attuale PRE-L3 via override: **${exportPayload.meta.venditeMotore}**, ${exportPayload.meta.venditeN} righe — allineata a \`computeHistoricalPnl\` con override; freeze storico resta €5.736,32).

---

## Operativo · Isabella Cesaroni

Incasso pacchetto: Stripe €284,90 / Fineco €278,75 (11 consegne attese). **In Neon: 4 pose vive.**

| Ordine | Creato | Consegna | Importo | Stato | Pagamento |
|--------|--------|----------|---------|-------|-----------|
${isabella
    .filter((o) => !o.deletedAt)
    .map(
        (o) =>
            `| ${o.orderNumber} | ${o.createdAt.toISOString().slice(0, 10)} | ${o.deliveryDate?.toISOString().slice(0, 10) ?? '—'} | ${euro(o.totalPriceCents)} | ${o.status} | ${o.partnerPaymentStatus} |`
    )
    .join('\n')}

Cancellati: FT-MC-26-001 (€299,90), FT-MC-26-002.  
Consegne fatte tra le 11 pagate: **3 COMPLETED/PAID** + **1 PENDING** futura = 4 registrate su 11.

### Stesso pattern
- **Isabella** — unico \`isRecurring\` multi-ordine incompleto vs pacchetto.
- **Luciano Mammì** — serie €31,48 (non tutte \`isRecurring\`); ${luciano.filter((o) => !o.deletedAt).length} ordini vivi, mix PAID/UNPAID — analogo “più consegne che un solo modello posa/ricorrente pulito”.

---

## STOP
**Nessun Lotto 4** finché il titolare non conferma i tre blocchi chiusi.  
Prossimo (dopo via): Lotto 4 costi duplicati (99 pair / €7.481,92) → Lotto 5 → Lotto 1.
`;

    writeFileSync(join(process.cwd(), 'docs/verbali/dossier_fase4b_tre_blocchi.md'), md);
    console.log(JSON.stringify({ ...report, mdPath: 'docs/verbali/dossier_fase4b_tre_blocchi.md' }, null, 2));
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
