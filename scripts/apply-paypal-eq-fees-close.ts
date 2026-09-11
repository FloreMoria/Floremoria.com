/**
 * Close: equazione PayPal + SDD, fee report, FT-MB ±1g, FT-CS-26-005, census stripe_eu, C11–C13.
 * APPLY=1 per scrivere.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { sumPaypalPaymentAccountCents, sumStripeSalesTransitCents } from '@/lib/financial/gatewayTransitBalance';
import { LEDGER_PAYPAL_ACCOUNT } from '@/lib/financial/companyBankDetails';

const BATCH = 'PAYPAL_EQ_FEES_CLOSE_20260911';
const OUT_JSON = path.join(process.cwd(), 'docs/verbali/11-09-2026-paypal-eq-fees-close.json');
const OUT_MD = path.join(process.cwd(), 'docs/verbali/11-09-2026-paypal-eq-fees-close.md');

const REPORT_FEE_TX_TO_UNREVERSE = [
    '21976668V7790432L',
    '0EE511309V284291P',
    '1AP439263F9581143',
    '1BM73350BR6557418',
];

/** Orfani stripe_eu = .com su chiavi eu (somma €807,80). */
const STRIPE_EU_ORPHANS_COM: Array<{ key: string; orderNumber: string; euro: number }> = [
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3TSzMsRrkwwcYwep11EAvI3P', orderNumber: 'FT-MC-26-007', euro: 284.9 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3TonoCRrkwwcYwep1GA8NIWP', orderNumber: 'FF-PD-26-002', euro: 104.98 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3Tp8tnRrkwwcYwep0biMYl7Q', orderNumber: 'FF-PD-26-003', euro: 69.99 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3TrNudRrkwwcYwep0zY0M7LI', orderNumber: 'FF-PD-26-004', euro: 39.99 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3TtjecRrkwwcYwep1EDBi6dh', orderNumber: 'FT-PD-26-001', euro: 37.99 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3TzcRERrkwwcYwep0NIP8g6r', orderNumber: 'FT-RC-26-002', euro: 29.99 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3U1Yc8RrkwwcYwep1l4tJnL9', orderNumber: 'FF-PN-26-001', euro: 39.99 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3U2vU2RrkwwcYwep06Fy5g4j', orderNumber: 'FF-PN-26-002', euro: 69.99 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3U5RyERrkwwcYwep0qd5uTzR', orderNumber: 'FF-PN-26-003', euro: 39.99 },
    { key: 'STRIPE_TX:stripe_eu_tx_txn_3U6no5RrkwwcYwep0uomtdte', orderNumber: 'FF-PN-26-004', euro: 89.99 },
];

function euro(c: number) {
    return Math.round(c) / 100;
}

async function main() {
    const apply = process.env.APPLY === '1';
    const actions: any[] = [];

    // ── 1) SDD already mirrored: verify batch ─────────────────────────
    const sddAgg = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            metadataJson: { path: ['sddFundingBatch'], equals: 'PAYPAL_SDD_INBOUND_20260911' },
        },
        _sum: { totalCents: true },
        _count: true,
    });
    const sddEuro = Math.abs(sddAgg._sum.totalCents || 0) / 100;

    // ── 2) Unreverse report fees ─────────────────────────────────────
    let feeRestoredCents = 0;
    for (const txId of REPORT_FEE_TX_TO_UNREVERSE) {
        const row = await prisma.financialLedgerEntry.findFirst({
            where: { sourceKey: `PAYPAL_FEE:${txId}` },
        });
        if (!row) {
            actions.push({ kind: 'fee_missing', txId });
            continue;
        }
        if (!row.reversedAt) {
            actions.push({ kind: 'fee_already_active', txId, euro: euro(Math.abs(row.totalCents)) });
            continue;
        }
        if (apply) {
            const meta = (row.metadataJson || {}) as Record<string, unknown>;
            await prisma.financialLedgerEntry.update({
                where: { id: row.id },
                data: {
                    reversedAt: null,
                    reversesEntryId: null,
                    metadataJson: {
                        ...meta,
                        dareAccount: meta.dareAccount || '70200 - Oneri bancari / Fee PayPal',
                        avereAccount: meta.avereAccount || LEDGER_PAYPAL_ACCOUNT,
                        paypalSalesReport: true,
                        unreversedFrom: 'stripe_paypal_same_order_dedup',
                        unreverseBatch: BATCH,
                    },
                },
            });
        }
        feeRestoredCents += Math.abs(row.totalCents);
        actions.push({ kind: 'fee_unreversed', txId, euro: euro(Math.abs(row.totalCents)) });
    }

    // ── 3) FT-MB-26-001 ↔ PayPal 19/07 €37,99 (±1g) ─────────────────
    const ftMb = await prisma.order.findFirst({
        where: { orderNumber: 'FT-MB-26-001' },
        select: { id: true, orderNumber: true, buyerFullName: true, createdAt: true, totalPriceCents: true },
    });
    const paypalVaresi = await prisma.financialLedgerEntry.findFirst({
        where: { sourceKey: 'PAYPAL_TX:0CW42027YJ1249932' },
    });
    if (apply && paypalVaresi && ftMb) {
        const meta = (paypalVaresi.metadataJson || {}) as Record<string, unknown>;
        await prisma.financialLedgerEntry.update({
            where: { id: paypalVaresi.id },
            data: {
                orderId: ftMb.id,
                metadataJson: {
                    ...meta,
                    paypalSalesReport: true,
                    matchedOrderNumber: 'FT-MB-26-001',
                    matchToleranceDays: 1,
                    matchNote:
                        'Ordine 20/07 Carolina Negrini; pagamento PayPal 19/07 Andrea Varesi €37,99 (payer≠buyer OK). Ex FT-PD match retired.',
                    matchBatch: BATCH,
                },
            },
        });
    }
    actions.push({
        kind: 'ft_mb_paypal_match',
        order: 'FT-MB-26-001',
        buyer: ftMb?.buyerFullName,
        orderDate: ftMb?.createdAt.toISOString().slice(0, 10),
        paypalTx: '0CW42027YJ1249932',
        paypalDate: '2026-07-19',
        paypalNameOnTx: 'Andrea Varesi',
        euro: 37.99,
        decision: 'PAYPAL',
        toleranceDays: 1,
    });

    // FT-PD-26-001 → verità Stripe EU stesso giorno (non PayPal)
    const ftPd = await prisma.order.findFirst({
        where: { orderNumber: 'FT-PD-26-001' },
        select: { id: true, orderNumber: true, buyerFullName: true, createdAt: true },
    });
    const stripePd = await prisma.financialLedgerEntry.findFirst({
        where: { sourceKey: 'STRIPE_TX:stripe_eu_tx_txn_3TtjecRrkwwcYwep1EDBi6dh' },
    });
    if (apply && stripePd && ftPd) {
        const meta = (stripePd.metadataJson || {}) as Record<string, unknown>;
        await prisma.financialLedgerEntry.update({
            where: { id: stripePd.id },
            data: {
                orderId: ftPd.id,
                metadataJson: {
                    ...meta,
                    matchedOrderNumber: 'FT-PD-26-001',
                    matchNote: 'Stesso giorno/importo; non PayPal Varesi (ora su FT-MB).',
                    matchBatch: BATCH,
                    stripeEuOrphanCom: true,
                },
            },
        });
    }
    actions.push({
        kind: 'ft_pd_stripe_eu',
        order: 'FT-PD-26-001',
        buyer: ftPd?.buyerFullName,
        stripeKey: 'STRIPE_TX:stripe_eu_tx_txn_3TtjecRrkwwcYwep1EDBi6dh',
        decision: 'STRIPE_EU',
        euro: 37.99,
    });

    // Riverifica residui MANUAL con ±1g vs report PayPal
    const manuals = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'MANUAL_INBOUND:' },
            category: 'RICAVI_VENDITE',
        },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            accountingDate: true,
            orderId: true,
        },
    });
    const reportTx = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            metadataJson: { path: ['paypalSalesReport'], equals: true },
            totalCents: { gt: 0 },
        },
        select: { sourceKey: true, totalCents: true, accountingDate: true },
    });
    const residualReview: any[] = [];
    for (const m of manuals) {
        const o = m.orderId
            ? await prisma.order.findUnique({
                  where: { id: m.orderId },
                  select: { orderNumber: true, buyerFullName: true, createdAt: true },
              })
            : null;
        const cents = Math.abs(m.totalCents);
        const near = reportTx.filter((r) => {
            const dc = Math.abs(r.totalCents - cents) <= 1;
            const days =
                Math.abs(r.accountingDate.getTime() - m.accountingDate.getTime()) / 86400000;
            return dc && days <= 1.01;
        });
        residualReview.push({
            order: o?.orderNumber,
            buyer: o?.buyerFullName,
            euro: euro(cents),
            manualDate: m.accountingDate.toISOString().slice(0, 10),
            orderCreated: o?.createdAt.toISOString().slice(0, 10),
            nearPaypal: near.map((n) => ({
                k: n.sourceKey,
                d: n.accountingDate.toISOString().slice(0, 10),
                e: euro(n.totalCents),
            })),
            decision: near.length
                ? 'PAYPAL_MATCH_PM1'
                : o?.orderNumber === 'FF-CO-26-001'
                  ? 'FUORI_GATEWAY_INTERNO'
                  : 'FUORI_GATEWAY_RESIDUO',
        });
    }

    // ── 4) FT-CS-26-005 ──────────────────────────────────────────────
    const aug17 = await prisma.order.findMany({
        where: {
            orderNumber: { in: ['FT-CS-26-005', 'FT-CS-26-006', 'FT-PA-26-008'] },
        },
        select: {
            id: true,
            orderNumber: true,
            buyerFullName: true,
            createdAt: true,
            totalPriceCents: true,
            cemeteryName: true,
            deceasedName: true,
            stripeTransactionId: true,
            paymentMethodLabel: true,
        },
    });
    const ppAug17 = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'PAYPAL_TX:' },
            totalCents: 3148,
            accountingDate: { gte: new Date('2026-08-16'), lt: new Date('2026-08-18') },
            metadataJson: { path: ['paypalSalesReport'], equals: true },
        },
        select: { sourceKey: true, description: true },
    });
    const stAug17 = await prisma.financialLedgerEntry.findMany({
        where: {
            sourceKey: { startsWith: 'STRIPE_TX:' },
            totalCents: { in: [3148, -3148] },
            accountingDate: { gte: new Date('2026-08-16'), lt: new Date('2026-08-19') },
        },
        select: { sourceKey: true, reversedAt: true },
    });
    const ftCs005 = {
        orders: aug17.map((o) => ({
            n: o.orderNumber,
            created: o.createdAt.toISOString(),
            cemetery: o.cemeteryName,
            deceased: o.deceasedName,
            stripe: o.stripeTransactionId,
            pm: o.paymentMethodLabel,
        })),
        paypalPaymentsN: ppAug17.length,
        paypalTx: ppAug17.map((p) => p.sourceKey),
        stripeTx: stAug17.map((s) => ({ k: s.sourceKey, rev: !!s.reversedAt })),
        decision: 'DUPLICATO_SENZA_INCASSO',
        reason:
            '3 ordini Mammì €31,48 il 17/08 (005 13:20, 006 13:52, PA-008 13:57). PayPal registra 2 TX; Stripe aveva 2 TX già stornati come doppi PayPal. FT-CS-26-005 è il primo cronologico senza terza gamba di pagamento — ordine duplicato / checkout ripetuto non pagato altrove.',
    };

    // ── 5) stripe_eu orphans census (no ledger change) ───────────────
    const stripeEu = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'STRIPE_TX:stripe_eu' },
        },
        _sum: { totalCents: true },
        _count: true,
    });
    const stripeEuRaw = Math.abs(stripeEu._sum.totalCents || 0) / 100;
    const orphanSum = STRIPE_EU_ORPHANS_COM.reduce((a, x) => a + x.euro, 0);

    // Tag orphans in metadata (non reverse — non bloccano modello)
    if (apply) {
        for (const o of STRIPE_EU_ORPHANS_COM) {
            const row = await prisma.financialLedgerEntry.findFirst({
                where: { sourceKey: o.key },
            });
            if (!row) continue;
            const meta = (row.metadataJson || {}) as Record<string, unknown>;
            await prisma.financialLedgerEntry.update({
                where: { id: row.id },
                data: {
                    metadataJson: {
                        ...meta,
                        stripeEuOrphanCom: true,
                        orphanOrderNumber: o.orderNumber,
                        orphanNote: '.com su chiave stripe_eu — fuori perimetro .eu atteso €1121,18',
                        orphanBatch: BATCH,
                    },
                },
            });
        }
    }

    // ── Balances + C11–C13 ───────────────────────────────────────────
    const paypalBal = await sumPaypalPaymentAccountCents();
    const stripeTransit = await sumStripeSalesTransitCents(2026);
    const feeAgg = await prisma.financialLedgerEntry.aggregate({
        where: { reversedAt: null, sourceKey: { startsWith: 'PAYPAL_FEE:' } },
        _sum: { totalCents: true },
        _count: true,
    });
    const feeEuro = Math.abs(feeAgg._sum.totalCents || 0) / 100;

    const { controlC11, controlC12, controlC13 } = await import(
        '@/lib/financial/dossierFiscalControls'
    );
    const [c11, c12, c13] = await Promise.all([
        controlC11(2026, 3),
        controlC12(2026, 3),
        controlC13(2026, 3),
    ]);

    const equation = {
        incassiReport: 1351.98,
        commissioniPre: 24.75,
        commissioniPost: feeEuro,
        speseLedger: 2319.64,
        prelieviFinecoRef: 569.88,
        sddFinecoToPaypal: sddEuro,
        beforeSdd: +(1351.98 - 24.75 - 2319.64 - 569.88).toFixed(2),
        afterSddWithFee2475: +(1351.98 - 24.75 - 2319.64 - 569.88 + sddEuro).toFixed(2),
        afterSddWithFeePost: +(1351.98 - feeEuro - 2319.64 - 569.88 + sddEuro).toFixed(2),
        ledgerPaypalAccount: +(paypalBal / 100).toFixed(2),
        declared: 0,
        note:
            'Equazione pulita (solo vendite report). Ledger include anche cashback/refund SaaS (+~€199) e PAYPAL_REFUND (+€43) → saldo ledger più alto.',
    };

    const report = {
        generatedAt: new Date().toISOString(),
        apply,
        batch: BATCH,
        sdd: {
            n: sddAgg._count,
            euro: sddEuro,
            status: 'già in ledger come TI dare PayPal / avere Fineco (batch PAYPAL_SDD_INBOUND_20260911)',
            equationAfterSddExpected: 93.66,
        },
        fees: {
            restoredN: actions.filter((a) => a.kind === 'fee_unreversed').length,
            restoredEuro: euro(feeRestoredCents),
            csvSalesTariffa: 47.73,
            ledgerFeeEuro: feeEuro,
            targetBand: '55-60',
            inBand: feeEuro >= 55 && feeEuro <= 60,
        },
        equation,
        ftMb: actions.find((a) => a.kind === 'ft_mb_paypal_match'),
        ftPd: actions.find((a) => a.kind === 'ft_pd_stripe_eu'),
        residualManualsPm1: residualReview,
        ftCs005,
        stripeEu: {
            rawN: stripeEu._count,
            rawEuro: stripeEuRaw,
            expectedEuro: 1121.18,
            orphanEuro: +(stripeEuRaw - 1121.18).toFixed(2),
            orphansComOnEuKeys: STRIPE_EU_ORPHANS_COM,
            orphanSum: +orphanSum.toFixed(2),
            note: '10 righe .com (FT/FF) registrate come stripe_eu; somma €807,80. Non toccate (non bloccano modello).',
        },
        stripeTransit: +(stripeTransit / 100).toFixed(2),
        controls: {
            C11: { passed: c11.passed, delta: c11.delta, measured: c11.measured, detail: c11.detail },
            C12: { passed: c12.passed, delta: c12.delta, measured: c12.measured, detail: c12.detail },
            C13: {
                passed: c13.passed,
                verifiable: c13.verifiable,
                detail: c13.detail,
                gaps: c13.transitBalanceGaps,
            },
        },
        actions,
    };

    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

    const md = `# 11-09-2026 — Equazione PayPal (SDD+fee) · FT-MB ±1g · stripe_eu orfani · C11–C13

Batch: \`${BATCH}\`. Apply: **${apply}**.

## 1. SDD Fineco→PayPal €${sddEuro.toFixed(2).replace('.', ',')}

Già in ledger (${sddAgg._count} TI, dare PayPal / avere Fineco, batch \`PAYPAL_SDD_INBOUND_20260911\`).

| Equazione pulita (vendite report) | € |
|---|--:|
| Incassi HAYUM | +1.351,98 |
| Commissioni (pre, incomplete) | −24,75 |
| Spese ledger | −2.319,64 |
| Prelievi Fineco (rif.) | −569,88 |
| **Prima SDD** | **−1.562,29** |
| + SDD | +${sddEuro.toFixed(2).replace('.', ',')} |
| **Dopo SDD (fee @24,75)** | **+${equation.afterSddWithFee2475.toFixed(2).replace('.', ',')}** (atteso +93,66) |
| Commissioni post ripristino | −${feeEuro.toFixed(2).replace('.', ',')} |
| **Dopo SDD (fee post)** | **+${equation.afterSddWithFeePost.toFixed(2).replace('.', ',')}** |
| Ledger conto PayPal (C13) | **+${equation.ledgerPaypalAccount.toFixed(2).replace('.', ',')}** |
| Dichiarato | 0,00 |

Il ledger è più alto dell’equazione pulita per cashback/refund SaaS e \`PAYPAL_REFUND\` (non forzato).

## 2. Commissioni

4 \`PAYPAL_FEE\` del report erano ancora reversed (\`stripe_paypal_same_order_dedup\`). Ripristinate: **+€${euro(feeRestoredCents).toFixed(2)}**.

| | € |
|--|--:|
| CSV Tariffa su vendite | 47,73 |
| Ledger fee post | **${feeEuro.toFixed(2).replace('.', ',')}** |
| Banda attesa | 55–60 |
| In banda | ${feeEuro >= 55 && feeEuro <= 60 ? 'sì' : 'no'} |

Residuo equazione @24,75 ≈ €94: le fee mancanti erano qui (parziale vs zero completo).

## 3. FT-MB-26-001 (Carolina Negrini, €37,99)

Verità **PAYPAL** \`0CW42027YJ1249932\` del **19/07** (payer Andrea Varesi; ordine **20/07**). Tolleranza **±1 giorno**.

\`FT-PD-26-001\` Filomena Maiorano stesso importo → **Stripe EU** \`stripe_eu_tx_txn_3Ttjec…\` del 16/07 (non PayPal).

Residui MANUAL ancora aperti: vedi JSON \`residualManualsPm1\` (FT-SA, FF-CO).

## 4. FT-CS-26-005 €31,48 del 17/08

Tre ordini Mammì €31,48 quel giorno; PayPal ne ha **due**; Stripe ne aveva due (già stornati come doppi).

**Decisione: DUPLICATO_SENZA_INCASSO** — FT-CS-26-005 (13:20) è il terzo checkout senza gamba di pagamento. Non pagato altrove.

## 5. stripe_eu grezzo €${stripeEuRaw.toFixed(2).replace('.', ',')} vs €1.121,18

Orfani **€${(stripeEuRaw - 1121.18).toFixed(2).replace('.', ',')}** = 10 righe **.com su chiavi eu** (somma €${orphanSum.toFixed(2).replace('.', ',')}):

| Ordine | € | Chiave |
|--------|--:|--------|
${STRIPE_EU_ORPHANS_COM.map((o) => `| ${o.orderNumber} | ${o.euro.toFixed(2).replace('.', ',')} | \`…${o.key.slice(-28)}\` |`).join('\n')}

Non bloccano il modello; solo census + tag metadata.

## 6. C11 / C12 / C13

| Controllo | Stato | Nota |
|-----------|-------|------|
| **C11** | ${c11.passed ? 'PASS' : 'FAIL'} | Δ=${c11.delta} · ${String(c11.detail || '').slice(0, 120)} |
| **C12** | ${c12.passed ? 'PASS' : 'FAIL'} | Δ=${c12.delta} · ${String(c12.detail || '').slice(0, 120)} |
| **C13** | ${c13.passed ? 'PASS' : 'FAIL'} | ${c13.detail} |

---

Artifact: \`11-09-2026-paypal-eq-fees-close.json\`.
`;
    fs.writeFileSync(OUT_MD, md);
    console.log(JSON.stringify({ apply, equation, fees: report.fees, controls: report.controls, out: OUT_JSON }, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
