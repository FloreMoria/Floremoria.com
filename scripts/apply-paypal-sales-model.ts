/**
 * Chiude modello vendite 2026 con report PayPal HAYUM:
 * 1) soft-reverse STRIPE_TX doppi vs pagamenti PayPal (eccesso vs €2.746,70)
 * 2) soft-reverse MANUAL_INBOUND coperti da PayPal o Stripe (fuori gateway → ~0)
 * 3) marca PAYPAL_TX dei 13 .eu + report sales metadata
 *
 * APPLY=1 per scrivere.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import prisma from '@/lib/prisma';
import {
    loadPaypalSalesReport,
    PAYPAL_PAY_LATER_KNOWN,
    PAYPAL_MERCHANT_CODE,
} from '@/lib/financial/paypalSalesReports';
import { LEDGER_PAYPAL_ACCOUNT } from '@/lib/financial/companyBankDetails';

const BATCH = 'PAYPAL_SALES_MODEL_20260911';
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-paypal-sales-model-apply.json');
const MODEL = path.join(process.cwd(), 'docs/verbali/11-09-2026-paypal-sales-model.json');
const TX_CSV = '/Users/floremoria/Downloads/Transazioni PayPal FloreMoria 2026.CSV';

function euro(c: number) {
    return Math.round(c) / 100;
}

function parseEuro(s: string): number {
    const t = (s || '').trim();
    if (!t) return 0;
    if (t.includes(',') && t.includes('.')) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
    if (t.includes(',')) return parseFloat(t.replace(',', '.'));
    return parseFloat(t);
}

async function main() {
    const apply = process.env.APPLY === '1';
    const ytd = loadPaypalSalesReport('YTD');
    const t1 = loadPaypalSalesReport('T1');
    const t2 = loadPaypalSalesReport('T2');
    const t3 = loadPaypalSalesReport('T3');

    const model = JSON.parse(fs.readFileSync(MODEL, 'utf8'));
    const doubles = model.punto1_stripeExcess.doubles as Array<{
        stripeId: string;
        stripeKey: string;
        stripeEuro: number;
        paypalDate: string;
        paypalTx: string;
        paypalEuro: number;
    }>;

    const paypalPayments = model.paypalPayments.rows as Array<{
        date: string;
        cents: number;
        txId: string;
        name: string;
        feeCents?: number;
        synthetic?: boolean;
    }>;

    const reversedStripe: any[] = [];
    for (const d of doubles) {
        const row = await prisma.financialLedgerEntry.findUnique({ where: { id: d.stripeId } });
        if (!row || row.reversedAt) continue;
        if (apply) {
            await prisma.financialLedgerEntry.update({
                where: { id: row.id },
                data: {
                    reversedAt: new Date(),
                    description: `[STORNO ${BATCH} — doppio PayPal∩Stripe] ${row.description || ''}`.slice(
                        0,
                        500
                    ),
                    metadataJson: {
                        ...((row.metadataJson || {}) as object),
                        reverseBatch: BATCH,
                        reverseReason: 'Ordine pagato su PayPal HAYUM; non contare anche su Stripe',
                        paypalDate: d.paypalDate,
                        paypalTx: d.paypalTx,
                    },
                },
            });
        }
        reversedStripe.push({
            id: row.id,
            key: row.sourceKey,
            euro: euro(Math.abs(row.totalCents)),
            paypalDate: d.paypalDate,
            paypalTx: d.paypalTx,
        });
    }

    // MANUAL_INBOUND covered by PayPal or Stripe
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
            description: true,
            metadataJson: true,
        },
    });
    const stripeLeft = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'STRIPE_TX:' },
        },
        select: { id: true, totalCents: true, accountingDate: true, sourceKey: true },
    });
    // exclude just-reversed if apply already ran in this process — re-read after reverses
    const stripeActive = apply
        ? await prisma.financialLedgerEntry.findMany({
              where: {
                  reversedAt: null,
                  fiscalYear: 2026,
                  sourceKey: { startsWith: 'STRIPE_TX:' },
              },
              select: { id: true, totalCents: true, accountingDate: true, sourceKey: true },
          })
        : stripeLeft.filter((s) => !doubles.some((d) => d.stripeId === s.id));

    const usedPaypal = new Set<number>();
    const usedStripe = new Set<string>();
    const reverseManuals: any[] = [];
    const residualManuals: any[] = [];

    const orders = await prisma.order.findMany({
        where: { deletedAt: null },
        select: { id: true, orderNumber: true, buyerFullName: true },
    });
    const onById = new Map(orders.map((o) => [o.id, o]));

    for (const m of manuals) {
        const md = m.accountingDate.toISOString().slice(0, 10);
        let reason: string | null = null;
        let paypalTx: string | null = null;

        let pi = -1;
        for (let i = 0; i < paypalPayments.length; i++) {
            if (usedPaypal.has(i)) continue;
            const p = paypalPayments[i]!;
            if (Math.abs(p.cents - Math.abs(m.totalCents)) > 1) continue;
            const dd =
                Math.abs(
                    new Date(md + 'T12:00:00Z').getTime() - new Date(p.date + 'T12:00:00Z').getTime()
                ) / 86400000;
            if (dd <= 3) {
                pi = i;
                break;
            }
        }
        if (pi >= 0) {
            usedPaypal.add(pi);
            reason = 'coperto_da_paypal_hayum';
            paypalTx = paypalPayments[pi]!.txId || null;
        } else {
            const hit = stripeActive.find((s) => {
                if (usedStripe.has(s.id)) return false;
                if (Math.abs(Math.abs(s.totalCents) - Math.abs(m.totalCents)) > 1) return false;
                const sd = s.accountingDate.toISOString().slice(0, 10);
                const dd =
                    Math.abs(
                        new Date(md + 'T12:00:00Z').getTime() - new Date(sd + 'T12:00:00Z').getTime()
                    ) / 86400000;
                return dd <= 3;
            });
            if (hit) {
                usedStripe.add(hit.id);
                reason = 'coperto_da_stripe_tx';
            }
        }

        const o = m.orderId ? onById.get(m.orderId) : null;
        if (reason) {
            if (apply) {
                await prisma.financialLedgerEntry.update({
                    where: { id: m.id },
                    data: {
                        reversedAt: new Date(),
                        description: `[STORNO ${BATCH} — ${reason}] ${m.description || ''}`.slice(
                            0,
                            500
                        ),
                        metadataJson: {
                            ...((m.metadataJson || {}) as object),
                            reverseBatch: BATCH,
                            reverseReason: reason,
                            paypalTx,
                        },
                    },
                });
            }
            reverseManuals.push({
                id: m.id,
                key: m.sourceKey,
                euro: euro(Math.abs(m.totalCents)),
                orderNumber: o?.orderNumber,
                reason,
                paypalTx,
            });
        } else {
            residualManuals.push({
                id: m.id,
                key: m.sourceKey,
                euro: euro(Math.abs(m.totalCents)),
                date: md,
                orderNumber: o?.orderNumber,
                buyer: o?.buyerFullName,
            });
        }
    }

    // Mark PAYPAL_TX for the 13 .eu + sales-report link; Pay Later note
    const thirteenTx = [
        '66C04847WL650301D',
        '22E30531F99808504',
        '8YH43677SS377553L',
        '44E519039S467634K',
        '2GU64478W4726692S',
        '4W6628604D401674M',
        '83N54580AU0027713',
        '3D552868PU399581S',
        '95E92452N40245344',
        '09C2701554000764W',
        '5VV92297N9957570R',
        '1T757598T7263511M',
        '43H07985E69976410',
    ];
    const markedPaypal: any[] = [];
    for (const txId of thirteenTx) {
        const row = await prisma.financialLedgerEntry.findFirst({
            where: { sourceKey: `PAYPAL_TX:${txId}`, reversedAt: null },
        });
        if (!row) continue;
        const isPayLater = txId === PAYPAL_PAY_LATER_KNOWN.txId;
        if (apply) {
            await prisma.financialLedgerEntry.update({
                where: { id: row.id },
                data: {
                    metadataJson: {
                        ...((row.metadataJson || {}) as object),
                        paypalSalesReport: true,
                        paypalMerchant: PAYPAL_MERCHANT_CODE,
                        euPaypalNative: true,
                        salesModelBatch: BATCH,
                        ...(isPayLater
                            ? {
                                  payLater: true,
                                  payLaterNote: PAYPAL_PAY_LATER_KNOWN.note,
                              }
                            : {}),
                        dareAccount:
                            ((row.metadataJson || {}) as any).dareAccount || LEDGER_PAYPAL_ACCOUNT,
                    },
                    description: isPayLater
                        ? `${row.description || ''} [Pay Later = incasso normale]`.slice(0, 500)
                        : row.description,
                },
            });
        }
        markedPaypal.push({ txId, id: row.id, payLater: isPayLater, euro: euro(row.totalCents) });
    }

    // Post totals
    const stripeSum = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'STRIPE_TX:' },
        },
        _sum: { totalCents: true },
        _count: true,
    });
    const manualSum = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'MANUAL_INBOUND:' },
            category: 'RICAVI_VENDITE',
        },
        _sum: { totalCents: true },
        _count: true,
    });

    // PayPal reconcile addends
    const raw = fs.readFileSync(TX_CSV, 'utf8');
    const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
    let feeOnSales = 0;
    const salesTxIds = new Set(
        paypalPayments.filter((p) => p.txId).map((p) => p.txId)
    );
    for (const row of parsed.data) {
        const tx = row['Codice transazione'] || '';
        if (!salesTxIds.has(tx)) continue;
        feeOnSales += Math.round(Math.abs(parseEuro(row['Tariffa'] || '')) * 100);
    }
    // Also fee rows PAYPAL_FEE linked
    const feeLedger = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            sourceKey: { in: [...salesTxIds].map((id) => `PAYPAL_FEE:${id}`) },
        },
        _sum: { totalCents: true },
    });

    const spese = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            OR: [{ sourceKey: { startsWith: 'PAYPAL_' } }, { sourceType: 'PAYPAL_MOVEMENT' }],
            category: {
                in: ['SPESE_SAAS', 'SPESE_OPERATIVE', 'ALTRI_COSTI', 'CONSULENZE', 'COSTI_FIORISTI'],
            },
        },
        _sum: { totalCents: true },
    });
    const payouts = await prisma.financialLedgerEntry.aggregate({
        where: { reversedAt: null, sourceKey: { startsWith: 'PAYPAL_PAYOUT:' } },
        _sum: { totalCents: true },
    });

    const incassi = Math.round(ytd.parsed.volumeCents);
    const commissioni = Math.abs(feeLedger._sum.totalCents || 0) || feeOnSales;
    const speseAbs = Math.abs(spese._sum.totalCents || 0);
    const prelieviFinecoRef = 56988;
    const prelieviLedger = Math.abs(payouts._sum.totalCents || 0);
    const equation =
        incassi - commissioni - speseAbs - prelieviFinecoRef;
    // User: incassi − commissioni − spese − prelievi = 0

    const stripeEu = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'STRIPE_TX:stripe_eu' },
        },
        _sum: { totalCents: true },
        _count: true,
    });

    const report = {
        generatedAt: new Date().toISOString(),
        apply,
        batch: BATCH,
        reports: {
            merchant: PAYPAL_MERCHANT_CODE,
            t1: { ...t1.meta, parsedQty: t1.parsed.qty, parsedEuro: euro(t1.parsed.volumeCents) },
            t2: { ...t2.meta, parsedQty: t2.parsed.qty, parsedEuro: euro(t2.parsed.volumeCents) },
            t3: {
                ...t3.meta,
                parsedQty: t3.parsed.qty,
                parsedEuro: euro(t3.parsed.volumeCents),
                provisional: true,
            },
            ytd: { ...ytd.meta, parsedQty: ytd.parsed.qty, parsedEuro: euro(ytd.parsed.volumeCents) },
        },
        reversedStripeTx: {
            n: reversedStripe.length,
            euro: euro(reversedStripe.reduce((s, r) => s + Math.round(r.euro * 100), 0)),
            rows: reversedStripe,
        },
        reversedManualInbound: {
            n: reverseManuals.length,
            euro: euro(reverseManuals.reduce((s, r) => s + Math.round(r.euro * 100), 0)),
            rows: reverseManuals,
        },
        residualFuoriGateway: {
            n: residualManuals.length,
            euro: euro(residualManuals.reduce((s, r) => s + Math.round(r.euro * 100), 0)),
            rows: residualManuals,
        },
        markedEuPaypalTx: markedPaypal,
        payLater: PAYPAL_PAY_LATER_KNOWN,
        post: {
            stripeTxN: stripeSum._count,
            stripeTxEuro: euro(Math.abs(stripeSum._sum.totalCents || 0)),
            stripeTargetEuro: 2746.7,
            stripeDeltaVsTargetEuro: euro(Math.abs(stripeSum._sum.totalCents || 0) - 274670),
            manualInboundN: manualSum._count,
            manualInboundEuro: euro(Math.abs(manualSum._sum.totalCents || 0)),
            stripeEuTxN: stripeEu._count,
            stripeEuTxEuro: euro(Math.abs(stripeEu._sum.totalCents || 0)),
            stripeEuExpectedEuro: 1121.18,
        },
        paypalAccountEquation: {
            incassiEuro: euro(incassi),
            commissioniEuro: euro(commissioni),
            speseEuro: euro(speseAbs),
            prelieviFinecoRefEuro: euro(prelieviFinecoRef),
            prelieviLedgerEuro: euro(prelieviLedger),
            resultEuro: euro(equation),
            declaredSaldoEuro: 0,
            scartoEuro: euro(equation - 0),
            note: 'Equazione: incassi − commissioni − spese − prelievi Fineco (€569,88). Scarto = quanto manca a saldo 0 con le spese ledger complete.',
        },
    };

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
