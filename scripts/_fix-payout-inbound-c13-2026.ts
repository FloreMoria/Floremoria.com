/**
 * Fix payout duplicati + inbound 75 ordini operativi + C13 saldi dichiarati €100/€0.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import {
    getPaypalDeclaredBalance,
    getStripeDeclaredBalance,
    setPaypalDeclaredBalance,
    setStripeDeclaredBalance,
} from '@/lib/financial/gatewayDeclaredBalance';
import { sumTransitLedgerCents } from '@/lib/financial/gatewayTransitBalance';
import { controlC13 } from '@/lib/financial/dossierFiscalControls';
import {
    buildStripeTransitCandidates,
    normalizeGatewayEventToken,
} from '@/lib/financial/gatewayTransitSync';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import {
    LEDGER_PAYPAL_ACCOUNT,
    LEDGER_STRIPE_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { ACCOUNT_RICAVI_VENDITE } from '@/lib/financial/chartOfAccounts';
import type { LedgerEntryInput } from '@/lib/financial/historicalLedgerTypes';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

const YEAR = 2026;
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-payout-inbound-c13.json');
const CSV = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');

function euro(c: number) {
    return Math.round(c) / 100;
}

function parseCsv(file: string) {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const h = lines[0]!.split(';');
    const idx = (n: string) => h.indexOf(n);
    const rows = [];
    for (const line of lines.slice(1)) {
        const c = line.split(';');
        const orderNumber = (c[idx('ID Ordine')] || '').trim();
        if (!orderNumber) continue;
        const priceRaw = (c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.');
        const priceCents = Math.round(parseFloat(priceRaw || '0') * 100) || 0;
        const ds = (c[idx('Data')] || '').trim();
        const m = ds.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const date = m ? new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!)) : null;
        rows.push({
            orderNumber,
            priceCents,
            date,
            status: (c[idx('Stato')] || '').trim(),
            user: (c[idx('Utente')] || '').trim(),
            recurring: (c[idx('Ricorrente')] || '').trim(),
        });
    }
    return rows;
}

async function main() {
    const start = new Date(`${YEAR}-01-01T00:00:00.000Z`);
    const end = new Date(`${YEAR}-12-31T23:59:59.999Z`);
    const csvRows = parseCsv(CSV);
    const poses = csvRows.filter((r) => r.priceCents === 0);
    const active = csvRows.filter((r) => r.priceCents > 0);
    const byQ: Record<string, { n: number; euro: number }> = {
        T1: { n: 0, euro: 0 },
        T2: { n: 0, euro: 0 },
        T3: { n: 0, euro: 0 },
    };
    for (const r of active) {
        if (!r.date) continue;
        const q = `T${Math.floor(r.date.getUTCMonth() / 3) + 1}`;
        if (!byQ[q]) byQ[q] = { n: 0, euro: 0 };
        byQ[q]!.n += 1;
        byQ[q]!.euro += r.priceCents / 100;
    }
    for (const k of Object.keys(byQ)) byQ[k]!.euro = Math.round(byQ[k]!.euro * 100) / 100;

    // ——— Snapshot payout PRIMA ———
    const stripeBefore = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'STRIPE_PAYOUT:' },
            accountingDate: { gte: start, lte: end },
        },
        select: {
            id: true,
            sourceKey: true,
            sourceId: true,
            totalCents: true,
            accountingDate: true,
            metadataJson: true,
            description: true,
        },
    });
    const paypalBefore = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'PAYPAL_PAYOUT:' } },
                { category: 'PAYPAL_PAYOUT' },
            ],
            accountingDate: { gte: start, lte: end },
        },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            accountingDate: true,
            description: true,
        },
    });

    const sumAbs = (rows: { totalCents: number }[]) =>
        rows.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // Duplicati Stripe: txn_* (e stripe_*_tx_txn_*) speculari ai po_*
    const dupList: Array<{
        date: string;
        euro: number;
        sourceA: string;
        sourceB: string;
        reason: string;
    }> = [];
    const toReverse: string[] = [];

    for (const r of stripeBefore) {
        const sid = r.sourceId || r.sourceKey.replace(/^STRIPE_PAYOUT:/i, '');
        if (/txn_/i.test(sid)) {
            const day = r.accountingDate.toISOString().slice(0, 10);
            const amt = Math.abs(r.totalCents);
            const poSibling = stripeBefore.find((o) => {
                if (o.id === r.id) return false;
                const oid = o.sourceId || '';
                return (
                    /po_/i.test(oid) &&
                    o.accountingDate.toISOString().slice(0, 10) === day &&
                    Math.abs(o.totalCents) === amt
                );
            });
            dupList.push({
                date: day,
                euro: euro(amt),
                sourceA: r.sourceKey,
                sourceB: poSibling?.sourceKey || '(po_* atteso in stripeFinanceMovement)',
                reason: 'speculare API: balance_txn del payout vs id po_*',
            });
            toReverse.push(r.id);
        }
    }

    // Dedup po_* doppi (stesso po id con prefissi diversi)
    const seenPo = new Set<string>();
    for (const r of stripeBefore) {
        if (toReverse.includes(r.id)) continue;
        const sid = r.sourceId || '';
        const m = sid.match(/po_[A-Za-z0-9]+/);
        if (!m) continue;
        const po = m[0]!;
        if (seenPo.has(po)) {
            dupList.push({
                date: r.accountingDate.toISOString().slice(0, 10),
                euro: euro(Math.abs(r.totalCents)),
                sourceA: r.sourceKey,
                sourceB: `già tenuto ${po}`,
                reason: 'doppio STRIPE_PAYOUT stesso po_*',
            });
            toReverse.push(r.id);
        } else seenPo.add(po);
    }

    // PayPal falsi payout: «Trasferimento…Ordine FloreMoria» (non bonifico Fineco)
    for (const r of paypalBefore) {
        if (/Ordine FloreMoria|Trasferimento di denaro da conto generico/i.test(r.description || '')) {
            if (/Prelievo generico/i.test(r.description || '')) continue;
            dupList.push({
                date: r.accountingDate.toISOString().slice(0, 10),
                euro: euro(Math.abs(r.totalCents)),
                sourceA: r.sourceKey,
                sourceB: '—',
                reason:
                    'PayPal mal classificato come PAYOUT (trasferimento ordine, non prelievo→banca)',
            });
            toReverse.push(r.id);
        }
    }

    let reversed = 0;
    for (const id of [...new Set(toReverse)]) {
        await prisma.financialLedgerEntry.update({
            where: { id },
            data: { reversedAt: new Date() },
        });
        reversed += 1;
    }

    // Re-insert missing po_* payouts (idempotent)
    const payoutCandidates = (await buildStripeTransitCandidates({ from: start, to: end })).filter(
        (c) => c.sourceKey.startsWith('STRIPE_PAYOUT:')
    );
    const payoutInsert = await appendLedgerEntries(payoutCandidates);

    const stripeAfter = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'STRIPE_PAYOUT:' },
            accountingDate: { gte: start, lte: end },
        },
        select: { totalCents: true, sourceKey: true, sourceId: true },
    });
    const paypalAfter = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'PAYPAL_PAYOUT:' } },
                { category: 'PAYPAL_PAYOUT' },
            ],
            accountingDate: { gte: start, lte: end },
        },
        select: { totalCents: true, sourceKey: true, description: true },
    });

    // Fineco
    const banks = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { gt: 0 },
            OR: [
                { accountingDate: { gte: start, lte: end } },
                { valueDate: { gte: start, lte: end } },
            ],
        },
        select: {
            description: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            matchType: true,
        },
    });
    const finecoGw = banks.filter((b) => /STRIPE|PAYPAL|PAY PAL/i.test(b.description || ''));
    const finecoStripe = finecoGw.filter((b) => /STRIPE/i.test(b.description || ''));
    const finecoPaypal = finecoGw.filter((b) => /PAYPAL|PAY PAL/i.test(b.description || ''));

    // ——— Inbound 75 ———
    const dbOrders = await prisma.order.findMany({
        where: { orderNumber: { in: active.map((a) => a.orderNumber) } },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            totalPriceCents: true,
            grossAmount: true,
            stripeTransactionId: true,
            paymentMethodLabel: true,
            buyerFullName: true,
            isRecurring: true,
            additionalInstructions: true,
            financeNotes: true,
            status: true,
        },
    });
    const byNum = new Map(dbOrders.map((o) => [o.orderNumber || '', o]));

    const existingInbound = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'STRIPE_TX:' } },
                { sourceKey: { startsWith: 'PAYPAL_TX:' } },
                { sourceKey: { startsWith: 'MANUAL_INBOUND:' } },
            ],
        },
        select: { orderId: true, sourceKey: true, sourceId: true },
        take: 30000,
    });
    const covered = new Set<string>();
    for (const e of existingInbound) {
        if (e.orderId) covered.add(e.orderId);
    }

    const inboundCandidates: LedgerEntryInput[] = [];
    const inboundLog: Array<{ orderNumber: string; euro: number; action: string }> = [];
    const csvNotInDb: string[] = [];

    for (const a of active) {
        const o = byNum.get(a.orderNumber);
        if (!o) {
            csvNotInDb.push(a.orderNumber);
            continue;
        }
        if (isPrepaidSubscriptionPoseOrder(o)) continue;
        if (covered.has(o.id)) {
            inboundLog.push({
                orderNumber: a.orderNumber,
                euro: a.priceCents / 100,
                action: 'già coperto',
            });
            continue;
        }
        const tok = o.stripeTransactionId
            ? normalizeGatewayEventToken(o.stripeTransactionId)
            : '';
        const hitTx = tok
            ? existingInbound.some(
                  (e) =>
                      e.sourceKey.includes(tok) ||
                      (o.stripeTransactionId && e.sourceKey.includes(o.stripeTransactionId))
              )
            : false;
        if (hitTx) {
            covered.add(o.id);
            inboundLog.push({
                orderNumber: a.orderNumber,
                euro: a.priceCents / 100,
                action: 'coperto via TX key',
            });
            continue;
        }

        const amount =
            o.grossAmount != null
                ? Math.round(Number(o.grossAmount) * 100)
                : o.totalPriceCents || a.priceCents;
        const isPaypal = /paypal/i.test(o.paymentMethodLabel || '');
        inboundCandidates.push({
            sourceKey: `MANUAL_INBOUND:${o.id}`.slice(0, 180),
            sourceType: 'ORDER',
            sourceId: o.id,
            direction: 'ENTRATA',
            category: 'RICAVI_VENDITE',
            accountingDate: o.createdAt,
            description: `Incasso da identificare — ordine ${o.orderNumber}`,
            counterpartyName: o.buyerFullName || 'Cliente',
            netCents: amount,
            vatRate: 0,
            vatCents: 0,
            totalCents: amount,
            reconciliationStatus: 'UNMATCHED',
            documentRef: o.orderNumber,
            orderId: o.id,
            entryNature: 'TRANSITO',
            settlementStatus: 'OPEN',
            metadataJson: {
                dareAccount: isPaypal ? LEDGER_PAYPAL_ACCOUNT : LEDGER_STRIPE_ACCOUNT,
                avereAccount: ACCOUNT_RICAVI_VENDITE,
                transitLeg: 'customer_payment',
                paymentStatus: 'DA_IDENTIFICARE',
                via: 'operativi_inbound_75',
            },
        });
        inboundLog.push({
            orderNumber: a.orderNumber,
            euro: amount / 100,
            action: 'MANUAL_INBOUND da identificare',
        });
    }

    const inboundIns = await appendLedgerEntries(inboundCandidates);

    // Declared balances
    await setStripeDeclaredBalance({
        balanceCents: 10000,
        asOf: new Date().toISOString().slice(0, 10),
        note: 'Cruscotto Stripe €100 (equazione transito)',
    });
    await setPaypalDeclaredBalance({
        balanceCents: 0,
        asOf: new Date().toISOString().slice(0, 10),
        note: 'Cruscotto PayPal €0',
    });

    const stripeBal = await sumTransitLedgerCents([
        '10300',
        'Banca c/o Stripe',
        'Conto Stripe',
    ]);
    const paypalBal = await sumTransitLedgerCents([
        '10200',
        'Banca c/o PayPal',
        'Conto PayPal',
    ]);
    const c13 = await controlC13(YEAR, 3);

    // Coverage 75
    const afterIn = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'STRIPE_TX:' } },
                { sourceKey: { startsWith: 'PAYPAL_TX:' } },
                { sourceKey: { startsWith: 'MANUAL_INBOUND:' } },
            ],
        },
        select: { orderId: true, sourceKey: true },
        take: 30000,
    });
    const covered2 = new Set(afterIn.map((e) => e.orderId).filter(Boolean) as string[]);
    // also TX without orderId matched by stripeTransactionId
    for (const o of dbOrders) {
        if (covered2.has(o.id)) continue;
        const tok = o.stripeTransactionId
            ? normalizeGatewayEventToken(o.stripeTransactionId)
            : '';
        if (
            tok &&
            afterIn.some(
                (e) =>
                    e.sourceKey.includes(tok) ||
                    (o.stripeTransactionId && e.sourceKey.includes(o.stripeTransactionId))
            )
        ) {
            covered2.add(o.id);
        }
    }
    const missingCov = dbOrders.filter((o) => !covered2.has(o.id));

    // taxRegister count diff
    const { measureRevenuePerimeterSets } = await import(
        '@/lib/financial/revenuePerimeterChannels'
    );
    const sets = await measureRevenuePerimeterSets(YEAR);
    const trio = sets.find((s) => s.id === 'taxRegister')!;
    const trioOrders = await prisma.order.findMany({
        where: { id: { in: trio.orderIds } },
        select: {
            orderNumber: true,
            totalPriceCents: true,
            grossAmount: true,
            status: true,
            createdAt: true,
        },
    });
    const csvSet = new Set(active.map((a) => a.orderNumber));
    const inTrioNotCsv = trioOrders.filter(
        (o) => o.orderNumber && !csvSet.has(o.orderNumber)
    );
    const inCsvNotTrio = active.filter(
        (a) => !trioOrders.some((o) => o.orderNumber === a.orderNumber)
    );

    // Leg breakdown for C13 gap
    const legs = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'STRIPE_' } },
                { sourceKey: { startsWith: 'PAYPAL_' } },
                { sourceKey: { startsWith: 'MANUAL_INBOUND:' } },
            ],
            accountingDate: { gte: start, lte: end },
        },
        select: { sourceKey: true, totalCents: true, metadataJson: true },
        take: 30000,
    });
    const legSum = (pred: (k: string) => boolean) =>
        euro(
            legs.filter((l) => pred(l.sourceKey)).reduce((s, l) => s + Math.abs(l.totalCents), 0)
        );

    const report = {
        generatedAt: new Date().toISOString(),
        operativi: {
            activeN: active.length,
            activeEuro: euro(active.reduce((s, r) => s + r.priceCents, 0)),
            byQ,
            poses: poses.map((p) => p.orderNumber),
        },
        payoutBefore: {
            stripeN: stripeBefore.length,
            stripeEuro: euro(sumAbs(stripeBefore)),
            paypalN: paypalBefore.length,
            paypalEuro: euro(sumAbs(paypalBefore)),
            totalEuro: euro(sumAbs(stripeBefore) + sumAbs(paypalBefore)),
        },
        payoutAfter: {
            stripeN: stripeAfter.length,
            stripeEuro: euro(sumAbs(stripeAfter)),
            paypalN: paypalAfter.length,
            paypalEuro: euro(sumAbs(paypalAfter)),
            totalEuro: euro(sumAbs(stripeAfter) + sumAbs(paypalAfter)),
            reversed,
            payoutInsert,
        },
        duplicates: dupList,
        fineco: {
            stripeEuro: euro(finecoStripe.reduce((s, b) => s + b.amountCents, 0)),
            paypalEuro: euro(finecoPaypal.reduce((s, b) => s + b.amountCents, 0)),
            totalEuro: euro(finecoGw.reduce((s, b) => s + b.amountCents, 0)),
            note: 'Fonte esterna: accrediti Ord: Stripe/PayPal su estratto Fineco 2026',
            deltaTransitMinusFineco:
                euro(sumAbs(stripeAfter) + sumAbs(paypalAfter)) -
                euro(finecoGw.reduce((s, b) => s + b.amountCents, 0)),
        },
        equation: {
            fatturato: 4098.68,
            fees: 178.49,
            payoutAttesoPerSaldo100: 3820.19,
            saldoAtteso: 100,
            payoutLedgerDopo: euro(sumAbs(stripeAfter) + sumAbs(paypalAfter)),
            finecoPayouts: euro(finecoGw.reduce((s, b) => s + b.amountCents, 0)),
        },
        inbound: {
            inserted: inboundIns.inserted,
            skipped: inboundIns.skipped,
            candidates: inboundCandidates.length,
            coverage: {
                dbOrdersMatchedCsv: dbOrders.length,
                withInbound: covered2.size,
                missing: missingCov.map((o) => o.orderNumber),
                csvNotInDb,
            },
            createdDaIdentificare: inboundLog.filter((x) =>
                x.action.includes('MANUAL_INBOUND')
            ).length,
        },
        balances: {
            stripeLedgerEuro: stripeBal / 100,
            paypalLedgerEuro: paypalBal / 100,
            totalLedgerEuro: (stripeBal + paypalBal) / 100,
            declaredStripe: (await getStripeDeclaredBalance())?.balanceCents! / 100,
            declaredPaypal: (await getPaypalDeclaredBalance())?.balanceCents! / 100,
        },
        legs2026Euro: {
            STRIPE_TX: legSum((k) => k.startsWith('STRIPE_TX:')),
            STRIPE_FEE: legSum((k) => k.startsWith('STRIPE_FEE:')),
            STRIPE_PAYOUT: legSum((k) => k.startsWith('STRIPE_PAYOUT:')),
            STRIPE_REFUND: legSum((k) => k.startsWith('STRIPE_REFUND:')),
            PAYPAL_TX: legSum((k) => k.startsWith('PAYPAL_TX:')),
            PAYPAL_FEE: legSum((k) => k.startsWith('PAYPAL_FEE:')),
            PAYPAL_PAYOUT: legSum((k) => k.startsWith('PAYPAL_PAYOUT:')),
            PAYPAL_REFUND: legSum((k) => k.startsWith('PAYPAL_REFUND:')),
            MANUAL_INBOUND: legSum((k) => k.startsWith('MANUAL_INBOUND:')),
        },
        c13: {
            passed: c13.passed,
            verifiable: c13.verifiable,
            detail: c13.detail,
            gaps: c13.transitBalanceGaps,
        },
        countDiff: {
            taxRegisterN: trio.orderIds.length,
            csvActiveN: active.length,
            inTrioNotCsv: inTrioNotCsv.map((o) => ({
                orderNumber: o.orderNumber,
                euro:
                    o.grossAmount != null
                        ? Number(o.grossAmount)
                        : o.totalPriceCents / 100,
                status: o.status,
            })),
            inCsvNotTrio: inCsvNotTrio.map((a) => ({
                orderNumber: a.orderNumber,
                euro: a.priceCents / 100,
            })),
        },
        fatturato4587:
            'Fonte: docs/verbali/09-09-2026-collegamento-incassi-ordini.md — «vendite verificate a mano €4.587,01». Stima manuale pre-lista operativa; dismettere a favore di €4.098,68 (75 ordini).',
    };

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
