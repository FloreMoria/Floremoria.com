/**
 * Post L5/L5bis — analisi sola lettura: transito · buoni · fioristi doppi ·
 * Isabella · Mammì · Δ€60 · margine/ordine.
 * Uso: npx tsx scripts/fase4b-post-l5bis-analisi.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import Stripe from 'stripe';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { compareGatewayTransitBalances } from '../lib/financial/gatewayTransitBalance';
import { computeFinanceQuadratura } from '../lib/financial/financeQuadratura';
import { getFinecoManualBalance } from '../lib/financial/finecoBalance';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';
import { isPrepaidSubscriptionPoseOrder } from '../lib/financial/prepaidSubscriptionOrders';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}
function dayKey(d: Date | null | undefined) {
    if (!d) return '';
    return d.toISOString().slice(0, 10);
}
function norm(s: string) {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const EU_MISSING_CENTS = 166_702; // €1.667,02 dichiarato
const ISABELLA_PACKAGE_REVENUE_CENTS = 28_490; // corrispettivo €284,90
const ISABELLA_DELIVERIES_TOTAL = 11;
const ISABELLA_DONE = 3; // + 1 il 12/09 ancora in anno → 4 in 2026 se fatta; 7 a primavera 2027
const ISABELLA_DUE_2027 = 7;

async function analyzeTransit() {
    const transit = await compareGatewayTransitBalances();
    const stripeT = transit.stripe.transitLedgerCents;
    const paypalT = transit.paypal.transitLedgerCents;
    const totalGap = Math.abs(stripeT) + Math.abs(paypalT); // both negative → sum abs

    // Ledger rows touching Stripe / PayPal transit accounts
    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026 },
        select: {
            id: true,
            sourceType: true,
            category: true,
            totalCents: true,
            direction: true,
            description: true,
            metadataJson: true,
            accountingDate: true,
            orderId: true,
        },
    });

    function mention(meta: unknown, codes: string[]) {
        const m = (meta || {}) as Record<string, unknown>;
        const dare = String(m.dareAccount || '');
        const avere = String(m.avereAccount || '');
        return codes.some((c) => dare.includes(c) || avere.includes(c));
    }
    function side(meta: unknown, codes: string[]): 'dare' | 'avere' | 'both' | null {
        const m = (meta || {}) as Record<string, unknown>;
        const dare = String(m.dareAccount || '');
        const avere = String(m.avereAccount || '');
        const d = codes.some((c) => dare.includes(c));
        const a = codes.some((c) => avere.includes(c));
        if (d && a) return 'both';
        if (d) return 'dare';
        if (a) return 'avere';
        return null;
    }

    const stripeCodes = ['10300', 'Banca c/o Stripe', 'Conto Stripe'];
    const paypalCodes = ['10200', 'Banca c/o PayPal', 'Conto PayPal'];

    let stripeCredit = 0; // dare stripe = wallet ↑
    let stripeDebit = 0;
    let paypalCredit = 0;
    let paypalDebit = 0;
    const stripeByType: Record<string, { n: number; credit: number; debit: number }> = {};
    const paypalByType: Record<string, { n: number; credit: number; debit: number }> = {};

    for (const r of rows) {
        const abs = Math.abs(r.totalCents);
        const ss = side(r.metadataJson, stripeCodes);
        if (ss === 'dare') {
            stripeCredit += abs;
            const b = (stripeByType[r.sourceType] ||= { n: 0, credit: 0, debit: 0 });
            b.n++;
            b.credit += abs;
        } else if (ss === 'avere') {
            stripeDebit += abs;
            const b = (stripeByType[r.sourceType] ||= { n: 0, credit: 0, debit: 0 });
            b.n++;
            b.debit += abs;
        }
        const ps = side(r.metadataJson, paypalCodes);
        if (ps === 'dare') {
            paypalCredit += abs;
            const b = (paypalByType[r.sourceType] ||= { n: 0, credit: 0, debit: 0 });
            b.n++;
            b.credit += abs;
        } else if (ps === 'avere') {
            paypalDebit += abs;
            const b = (paypalByType[r.sourceType] ||= { n: 0, credit: 0, debit: 0 });
            b.n++;
            b.debit += abs;
        }
    }

    // .com ORDERS paid with stripe/paypal that never credited transit
    const orders2026 = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
            partnerPaymentStatus: 'PAID',
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            stripeTransactionId: true,
            paymentMethodLabel: true,
            buyerFullName: true,
            isRecurring: true,
            createdAt: true,
            items: { select: { priceCents: true, quantity: true, product: { select: { name: true, slug: true } } } },
            offerRedemptions: {
                select: {
                    id: true,
                    offer: { select: { name: true, code: true, type: true, value: true } },
                },
            },
        },
    });

    // Sum fees on stripe finance / ledger
    const feeRows = rows.filter(
        (r) =>
            /fee|commissione|stripe fee|paypal.*fee/i.test(r.description || '') ||
            r.category === 'ONERI_BANCARI'
    );
    const stripeFeesLedger = rows
        .filter(
            (r) =>
                r.sourceType === 'STRIPE_MOVEMENT' ||
                r.sourceType === 'STRIPE_FEE' ||
                /stripe.*fee|commissione.*stripe/i.test(r.description || '')
        )
        .reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // ORDERS with grossAmount vs totalPriceCents
    const withGross = orders2026.filter((o) => o.grossAmount != null && Number.isFinite(o.grossAmount));
    const discountLike = withGross.filter((o) => {
        const grossCents = Math.round(Number(o.grossAmount) * 100);
        return Math.abs(grossCents - o.totalPriceCents) > 2;
    });

    // Also: totalPrice vs sum items
    const listVsItems = orders2026
        .map((o) => {
            const itemsSum = o.items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
            return { o, itemsSum, delta: o.totalPriceCents - itemsSum };
        })
        .filter((x) => Math.abs(x.delta) > 2);

    // Paid orders whose amount isn't reflected as dare on transit (heuristic: no ORDER ledger with stripe dare)
    const orderLedger = rows.filter((r) => r.sourceType === 'ORDER' || r.orderId);
    const orderIdsWithStripeCredit = new Set(
        orderLedger
            .filter((r) => side(r.metadataJson, stripeCodes) === 'dare')
            .map((r) => r.orderId)
            .filter(Boolean) as string[]
    );
    const orderIdsWithPaypalCredit = new Set(
        orderLedger
            .filter((r) => side(r.metadataJson, paypalCodes) === 'dare')
            .map((r) => r.orderId)
            .filter(Boolean) as string[]
    );

    const stripePaid = orders2026.filter(
        (o) =>
            o.stripeTransactionId ||
            /stripe|card|apple|google/i.test(o.paymentMethodLabel || '')
    );
    const paypalPaid = orders2026.filter((o) => /paypal/i.test(o.paymentMethodLabel || ''));

    const stripeNoTransitCredit = stripePaid.filter((o) => !orderIdsWithStripeCredit.has(o.id));
    const paypalNoTransitCredit = paypalPaid.filter((o) => !orderIdsWithPaypalCredit.has(o.id));

    const stripeNoCreditSum = stripeNoTransitCredit.reduce((s, o) => {
        const g =
            o.grossAmount != null ? Math.round(Number(o.grossAmount) * 100) : o.totalPriceCents;
        return s + g;
    }, 0);
    const paypalNoCreditSum = paypalNoTransitCredit.reduce((s, o) => s + o.totalPriceCents, 0);

    // Commissioni: sum stripeFee on orders + paypal fees if any
    const stripeFeeSum = orders2026.reduce((s, o) => {
        if (o.stripeFee == null) return s;
        return s + Math.round(Number(o.stripeFee) * 100);
    }, 0);

    const unexplained =
        totalGap - EU_MISSING_CENTS - Math.min(stripeNoCreditSum + paypalNoCreditSum, totalGap);

    return {
        stripeTransit: stripeT,
        paypalTransit: paypalT,
        totalGap,
        euMissing: EU_MISSING_CENTS,
        remainAfterEu: totalGap - EU_MISSING_CENTS,
        stripe: {
            credit: stripeCredit,
            debit: stripeDebit,
            net: stripeCredit - stripeDebit,
            byType: stripeByType,
            paidOrders: stripePaid.length,
            noTransitCreditN: stripeNoTransitCredit.length,
            noTransitCreditEuro: stripeNoCreditSum,
            feeOnOrders: stripeFeeSum,
        },
        paypal: {
            credit: paypalCredit,
            debit: paypalDebit,
            net: paypalCredit - paypalDebit,
            byType: paypalByType,
            paidOrders: paypalPaid.length,
            noTransitCreditN: paypalNoTransitCredit.length,
            noTransitCreditEuro: paypalNoCreditSum,
        },
        feesLedgerSample: stripeFeesLedger,
        compositionHint: {
            euUnregistered: EU_MISSING_CENTS,
            comWithoutTransitCredit: stripeNoCreditSum + paypalNoCreditSum,
            feesOnOrders: stripeFeeSum,
            // Cap attribution so we don't double-count
            note: 'comWithoutTransitCredit include listino ordini .com già a libro come ricavo ma senza dare sul wallet — non sono "mancanti" dal CE, sono squilibrio patrimoniale del modello a 3 gambe.',
        },
        discountLikeOrders: discountLike.slice(0, 50).map((o) => ({
            orderNumber: o.orderNumber,
            listino: o.totalPriceCents,
            grossCents: Math.round(Number(o.grossAmount) * 100),
            delta: o.totalPriceCents - Math.round(Number(o.grossAmount) * 100),
            fee: o.stripeFee,
            net: o.netAmount,
            offers: o.offerRedemptions.map((r) => r.offer?.code || r.offer?.name),
            method: o.paymentMethodLabel,
        })),
        listVsItemsN: listVsItems.length,
        listVsItemsSample: listVsItems.slice(0, 20).map((x) => ({
            orderNumber: x.o.orderNumber,
            total: x.o.totalPriceCents,
            items: x.itemsSum,
            delta: x.delta,
        })),
        unexplainedRaw: unexplained,
    };
}

async function analyzeFloristDoubles() {
    const payouts = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: 'FLORIST_PAYOUT',
        },
        select: {
            id: true,
            totalCents: true,
            accountingDate: true,
            counterpartyName: true,
            description: true,
            partnerId: true,
            orderId: true,
            category: true,
        },
    });
    const bankOut = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: 'BANK_LINE',
            OR: [{ direction: 'USCITA' }, { totalCents: { lt: 0 } }],
        },
        select: {
            id: true,
            totalCents: true,
            accountingDate: true,
            counterpartyName: true,
            description: true,
            category: true,
        },
    });

    const usable = applyFiscalAuthorityHierarchy(
        await prisma.financialLedgerEntry.findMany({
            where: { reversedAt: null, fiscalYear: 2026 },
            select: {
                id: true,
                sourceType: true,
                sourceId: true,
                sourceKey: true,
                orderId: true,
                documentRef: true,
                accountingDate: true,
                totalCents: true,
                direction: true,
                category: true,
                bankLineId: true,
                description: true,
                counterpartyName: true,
                attachmentUrl: true,
                metadataJson: true,
            },
        })
    );
    const usableIds = new Set(usable.map((u) => u.id));

    type Match = {
        payoutId: string;
        bankId: string;
        amount: number;
        days: number;
        florist: string;
        bankDesc: string;
        certain: boolean;
        cumulativeSuspect: boolean;
        inPnl: boolean;
    };
    const matches: Match[] = [];
    const usedBank = new Set<string>();

    for (const p of payouts) {
        const abs = Math.abs(p.totalCents);
        const name = norm(p.counterpartyName || p.description || '');
        const t0 = p.accountingDate.getTime();
        const candidates = bankOut.filter((b) => {
            if (usedBank.has(b.id)) return false;
            const bAbs = Math.abs(b.totalCents);
            const days = Math.abs(b.accountingDate.getTime() - t0) / 86400000;
            if (days > 15) return false;
            // exact amount
            const exact = Math.abs(bAbs - abs) <= 2;
            // cumulative: bank larger, multiple of payout-ish
            const cumul = bAbs >= abs - 2 && bAbs <= abs * 6 + 50;
            if (!exact && !cumul) return false;
            const blob = norm(`${b.counterpartyName || ''} ${b.description || ''}`);
            // name overlap
            const tokens = name.split(' ').filter((w) => w.length > 2);
            const hit = tokens.filter((w) => blob.includes(w)).length;
            if (tokens.length >= 2 && hit < 2 && !exact) return false;
            if (tokens.length >= 1 && hit < 1) return false;
            return true;
        });
        // Prefer exact
        candidates.sort((a, b) => {
            const ae = Math.abs(Math.abs(a.totalCents) - abs);
            const be = Math.abs(Math.abs(b.totalCents) - abs);
            return ae - be;
        });
        const best = candidates[0];
        if (!best) continue;
        usedBank.add(best.id);
        const bAbs = Math.abs(best.totalCents);
        const exact = Math.abs(bAbs - abs) <= 2;
        matches.push({
            payoutId: p.id,
            bankId: best.id,
            amount: abs,
            days: Math.round(Math.abs(best.accountingDate.getTime() - t0) / 86400000),
            florist: p.counterpartyName || '',
            bankDesc: (best.description || '').slice(0, 80),
            certain: exact,
            cumulativeSuspect: !exact && bAbs > abs + 2,
            inPnl: usableIds.has(p.id) && usableIds.has(best.id),
        });
    }

    const certain = matches.filter((m) => m.certain);
    const cumul = matches.filter((m) => m.cumulativeSuspect);
    // Impact: if both in PnL hierarchy as costs → double count = certain amount still visible
    let doubleHitCents = 0;
    for (const m of certain) {
        if (m.inPnl) doubleHitCents += m.amount;
    }

    return {
        payoutsN: payouts.length,
        payoutsEuro: payouts.reduce((s, p) => s + Math.abs(p.totalCents), 0),
        matchedN: matches.length,
        matchedEuro: matches.reduce((s, m) => s + m.amount, 0),
        certainN: certain.length,
        certainEuro: certain.reduce((s, m) => s + m.amount, 0),
        cumulativeN: cumul.length,
        cumulativeEuro: cumul.reduce((s, m) => s + m.amount, 0),
        bothInPnlCertainEuro: doubleHitCents,
        sampleCertain: certain.slice(0, 15),
        sampleCumul: cumul.slice(0, 10),
    };
}

async function analyzeIsabella() {
    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            OR: [
                { buyerFullName: { contains: 'Isabella Cesaroni', mode: 'insensitive' } },
                { buyerFullName: { contains: 'Cesaroni', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            grossAmount: true,
            deliveryDate: true,
            status: true,
            isRecurring: true,
            floristCompensationCents: true,
            createdAt: true,
            partnerPaymentStatus: true,
        },
        orderBy: { createdAt: 'asc' },
    });
    const unitCost =
        orders
            .filter((o) => o.floristCompensationCents != null)
            .reduce((s, o) => s + (o.floristCompensationCents || 0), 0) /
            Math.max(1, orders.filter((o) => o.floristCompensationCents != null).length) || 0;
    const revenuePerPose = Math.round(ISABELLA_PACKAGE_REVENUE_CENTS / ISABELLA_DELIVERIES_TOTAL);
    const costPerPose = Math.round(unitCost) || Math.round(
        orders.reduce((s, o) => s + (o.floristCompensationCents || 0), 0) /
            Math.max(1, orders.length)
    );
    return {
        ordersInDb: orders.length,
        orders: orders.map((o) => ({
            n: o.orderNumber,
            listino: euro(o.totalPriceCents),
            gross: o.grossAmount,
            delivery: dayKey(o.deliveryDate),
            status: o.status,
            recurring: o.isRecurring,
            florist: o.floristCompensationCents,
            paid: o.partnerPaymentStatus,
        })),
        packageRevenue: euro(ISABELLA_PACKAGE_REVENUE_CENTS),
        deliveriesTotal: ISABELLA_DELIVERIES_TOTAL,
        due2027: ISABELLA_DUE_2027,
        revenueDefer2027: euro(revenuePerPose * ISABELLA_DUE_2027),
        costDefer2027: euro(costPerPose * ISABELLA_DUE_2027),
        revenuePerPose: euro(revenuePerPose),
        costPerPose: euro(costPerPose),
    };
}

async function analyzeMammi() {
    const txn = 'txn_3U5R2d4W4pZWhSUs0z67gjHy';
    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { stripeTransactionId: { contains: '3U5R2d' } },
                { orderNumber: { in: ['FT-CS-26-005', 'FT-CS-26-006'] } },
            ],
        },
        select: {
            orderNumber: true,
            totalPriceCents: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            stripeTransactionId: true,
            partnerPaymentStatus: true,
            status: true,
            buyerFullName: true,
        },
    });

    // Shared txn pattern: same stripeTransactionId on >1 order
    const paid = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            stripeTransactionId: { not: null },
            createdAt: { gte: new Date('2026-01-01') },
        },
        select: {
            orderNumber: true,
            stripeTransactionId: true,
            totalPriceCents: true,
            partnerPaymentStatus: true,
        },
    });
    const byTxn = new Map<string, typeof paid>();
    for (const o of paid) {
        const k = (o.stripeTransactionId || '').replace(/^stripe_tx_/, '');
        if (!k) continue;
        const arr = byTxn.get(k) || [];
        arr.push(o);
        byTxn.set(k, arr);
    }
    const shared = [...byTxn.entries()]
        .filter(([, arr]) => arr.length > 1)
        .map(([k, arr]) => ({
            txn: k,
            n: arr.length,
            orders: arr.map((o) => o.orderNumber),
            sumListino: arr.reduce((s, o) => s + o.totalPriceCents, 0),
        }));

    let stripeAmount: number | null = null;
    let stripeStatus: string | null = null;
    let stripeErr: string | null = null;
    try {
        const key = process.env.STRIPE_SECRET_KEY?.trim();
        if (!key) throw new Error('STRIPE_SECRET_KEY assente');
        const stripe = new Stripe(key, { apiVersion: '2023-10-16' as any });
        // balance transaction id style txn_
        try {
            const bt = await stripe.balanceTransactions.retrieve(txn);
            stripeAmount = bt.amount;
            stripeStatus = bt.type;
        } catch {
            // try as charge / payment intent via search
            const list = await stripe.balanceTransactions.list({ limit: 100 });
            const hit = list.data.find((b) => b.id === txn || b.id.includes('3U5R2d'));
            if (hit) {
                stripeAmount = hit.amount;
                stripeStatus = hit.type;
            } else {
                stripeErr = 'txn non trovato via retrieve/list recente';
            }
        }
    } catch (e) {
        stripeErr = e instanceof Error ? e.message : String(e);
    }

    // Also check stripe_finance_movements
    const sfm = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [{ stripeId: { contains: '3U5R2d' } }, { balanceTransactionId: { contains: '3U5R2d' } }],
        },
        take: 10,
    }).catch(() => []);

    return {
        orders,
        stripeAmountCents: stripeAmount,
        stripeAmountEuro: stripeAmount != null ? euro(stripeAmount) : null,
        stripeStatus,
        stripeErr,
        stripeFinanceRows: sfm,
        sharedTxnPatterns: shared,
    };
}

async function analyzeDelta60() {
    const yearStart = new Date(Date.UTC(2026, 0, 1));
    const yearEnd = new Date(Date.UTC(2027, 0, 1));
    const manual = await getFinecoManualBalance();
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const quad = await computeFinanceQuadratura();

    const openingDoc = await prisma.bankStatementDocument.findFirst({
        where: {
            openingBalanceCents: { not: null },
            OR: [
                { periodStart: { gte: yearStart, lt: yearEnd } },
                { periodEnd: { gte: yearStart, lt: yearEnd } },
            ],
        },
        orderBy: { periodStart: 'asc' },
        select: {
            id: true,
            fileName: true,
            openingBalanceCents: true,
            closingBalanceCents: true,
            periodStart: true,
            periodEnd: true,
        },
    });

    const lines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { accountingDate: { gte: yearStart, lt: yearEnd } },
                { AND: [{ accountingDate: null }, { valueDate: { gte: yearStart, lt: yearEnd } }] },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            documentId: true,
        },
        orderBy: { accountingDate: 'asc' },
    });

    const sumLines = lines.reduce((s, l) => s + l.amountCents, 0);
    const opening = openingDoc?.openingBalanceCents || 0;
    const cashPnl = opening + sumLines;

    // Find €60 components: compare to manual
    const real = manual?.balanceCents ?? null;
    const diffCashVsReal = real == null ? null : cashPnl - real;
    const diffCashVsCalc = cashPnl - quad.calculatedBalanceCents;
    const diffRealVsCalc =
        real == null ? null : real - quad.calculatedBalanceCents;

    // Look for lines of exactly ±6000 or pairs that sum to 6000
    const exactly60 = lines.filter((l) => Math.abs(l.amountCents) === 6000);
    // Duplicate lines same day+amount
    const dupMap = new Map<string, typeof lines>();
    for (const l of lines) {
        const k = `${dayKey(l.accountingDate || l.valueDate)}|${l.amountCents}|${(l.description || '').slice(0, 40)}`;
        const arr = dupMap.get(k) || [];
        arr.push(l);
        dupMap.set(k, arr);
    }
    const dups = [...dupMap.entries()].filter(([, v]) => v.length > 1);

    // Docs closing vs opening chain
    const docs = await prisma.bankStatementDocument.findMany({
        where: {
            OR: [
                { periodStart: { gte: yearStart, lt: yearEnd } },
                { periodEnd: { gte: yearStart, lt: yearEnd } },
            ],
        },
        select: {
            fileName: true,
            openingBalanceCents: true,
            closingBalanceCents: true,
            periodStart: true,
            periodEnd: true,
        },
        orderBy: { periodStart: 'asc' },
    });

    return {
        cashPnlFormula: 'opening_primo_rendiconto + Σ bank_statement_lines 2026',
        cashPnlCents: cashPnl,
        cashPnlEuro: euro(cashPnl),
        pnlReported: euro(pnl.cashBankBalanceCents),
        realManualCents: real,
        realManualEuro: real != null ? euro(real) : null,
        realAlignedAt: manual?.alignedAt ?? null,
        realNote: manual?.note ?? null,
        calculatedCents: quad.calculatedBalanceCents,
        calculatedEuro: euro(quad.calculatedBalanceCents),
        openingCents: opening,
        openingEuro: euro(opening),
        openingDoc,
        sumLinesCents: sumLines,
        sumLinesEuro: euro(sumLines),
        linesN: lines.length,
        diffCashVsRealCents: diffCashVsReal,
        diffCashVsRealEuro: diffCashVsReal != null ? euro(diffCashVsReal) : null,
        diffCashVsCalcCents: diffCashVsCalc,
        diffCashVsCalcEuro: euro(diffCashVsCalc),
        diffRealVsCalcCents: diffRealVsCalc,
        diffRealVsCalcEuro: diffRealVsCalc != null ? euro(diffRealVsCalc) : null,
        exactly60: exactly60.map((l) => ({
            id: l.id,
            date: dayKey(l.accountingDate || l.valueDate),
            amount: euro(l.amountCents),
            desc: (l.description || '').slice(0, 100),
        })),
        duplicateGroups: dups.slice(0, 20).map(([k, v]) => ({
            key: k,
            n: v.length,
            amount: euro(v[0].amountCents),
        })),
        docs,
        invarianteUfficiale:
            'cash PnL (opening + Σ movimenti estratto) è l’invariante contabile del motore; il saldo «reale» manuale è allineamento operativo admin e può restare stale. La fascia quadratura usa calculatedBalance (apertura+movimenti o chiusura rendiconto). Δ€60 = cashPnl − realManual.',
    };
}

async function analyzeMargins() {
    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
            partnerPaymentStatus: 'PAID',
            status: { not: 'CANCELLED' },
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            grossAmount: true,
            floristCompensationCents: true,
            isRecurring: true,
            buyerFullName: true,
            items: { select: { product: { select: { name: true, slug: true } } } },
        },
    });

    const isCarnet = (o: (typeof orders)[0]) => {
        if (o.isRecurring) return true;
        const blob = o.items.map((i) => `${i.product?.name || ''} ${i.product?.slug || ''}`).join(' ');
        return /carnet|abbonamento|subscription|pacchetto|pose/i.test(blob);
    };

    const exCarnet = orders.filter((o) => !isCarnet(o));
    const carnet = orders.filter((o) => isCarnet(o));

    function marginOf(o: (typeof orders)[0]) {
        const rev =
            o.grossAmount != null && Number.isFinite(o.grossAmount)
                ? Math.round(Number(o.grossAmount) * 100)
                : o.totalPriceCents;
        const cost = o.floristCompensationCents ?? null;
        return { rev, cost, margin: cost == null ? null : rev - cost };
    }

    const withCost = exCarnet.map((o) => ({ o, ...marginOf(o) })).filter((x) => x.cost != null);
    const totRev = withCost.reduce((s, x) => s + x.rev, 0);
    const totCost = withCost.reduce((s, x) => s + (x.cost || 0), 0);
    const margins = withCost.map((x) => x.margin!).sort((a, b) => a - b);
    const median = margins.length ? margins[Math.floor(margins.length / 2)] : 0;

    return {
        paidOrders: orders.length,
        carnetExcluded: carnet.length,
        exCarnet: exCarnet.length,
        withFloristCost: withCost.length,
        withoutFloristCost: exCarnet.length - withCost.length,
        totRevenue: euro(totRev),
        totFloristCost: euro(totCost),
        totMargin: euro(totRev - totCost),
        avgMargin: withCost.length ? euro(Math.round((totRev - totCost) / withCost.length)) : null,
        medianMargin: euro(median),
        marginPct: totRev ? `${(((totRev - totCost) / totRev) * 100).toFixed(1)}%` : null,
        sampleLow: withCost
            .filter((x) => x.margin != null)
            .sort((a, b) => (a.margin || 0) - (b.margin || 0))
            .slice(0, 8)
            .map((x) => ({
                n: x.o.orderNumber,
                rev: euro(x.rev),
                cost: euro(x.cost || 0),
                margin: euro(x.margin || 0),
            })),
        sampleHigh: withCost
            .filter((x) => x.margin != null)
            .sort((a, b) => (b.margin || 0) - (a.margin || 0))
            .slice(0, 8)
            .map((x) => ({
                n: x.o.orderNumber,
                rev: euro(x.rev),
                cost: euro(x.cost || 0),
                margin: euro(x.margin || 0),
            })),
        carnetSample: carnet.slice(0, 10).map((o) => ({
            n: o.orderNumber,
            listino: euro(o.totalPriceCents),
            buyer: o.buyerFullName,
        })),
    };
}

async function orderModelFields() {
    return {
        existing: {
            totalPriceCents: 'listino / totale ordine (centesimi) — oggi usato come ricavo',
            grossAmount: 'Float? — spesso = importo gateway lordo (incassato)',
            stripeFee: 'Float? — fee Stripe',
            netAmount: 'Float? — netto dopo fee',
            offerRedemptions: 'relazione Offer → buoni usati (value tipicamente % o cents)',
            partnerCommissionCents: 'fee partner, non sconto cliente',
        },
        missing: {
            listPriceCents: 'da aggiungere (o rinominare semanticamente totalPriceCents)',
            discountCents: 'da aggiungere (buono/sconto assoluto)',
            amountPaidCents: 'da aggiungere (incassato = corrispettivo; match gateway)',
        },
        design:
            'Order: listPriceCents + discountCents + amountPaidCents (corrispettivo). Matching gateway su amountPaidCents. CE ricavi su amountPaidCents. grossAmount/stripeFee/netAmount restano snapshot gateway.',
    };
}

async function main() {
    console.log('=== L5bis verify + analyses ===');
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const transit = await compareGatewayTransitBalances();
    const snap = {
        rai: euro(pnl.risultatoAnteImposteCents),
        costi: euro(
            pnl.costiFioristiCents +
                pnl.costiFatturePassiveSdiCents +
                pnl.costiSaasCents +
                pnl.costiOperativiCents +
                pnl.oneriBancariCents
        ),
        banca: euro(pnl.cashBankBalanceCents),
        paypal: euro(transit.paypal.transitLedgerCents),
        stripe: euro(transit.stripe.transitLedgerCents),
    };

    const [transitA, florist, isabella, mammi, delta60, margins, model] = await Promise.all([
        analyzeTransit(),
        analyzeFloristDoubles(),
        analyzeIsabella(),
        analyzeMammi(),
        analyzeDelta60(),
        analyzeMargins(),
        orderModelFields(),
    ]);

    // Refine transit composition with post-l5bis paypal
    const totalGap = Math.abs(transit.stripe.transitLedgerCents) + Math.abs(transit.paypal.transitLedgerCents);
    const remain = totalGap - EU_MISSING_CENTS;

    // Attribution (non overlapping narrative):
    // A) .eu not on books: 166702
    // B) .com paid but no dare on transit: use min(comNoCredit, remain) as "patrimoniale"
    // C) fees: stripeFeeSum (part of why wallet < gross)
    // D) unexplained = remain - attributed com portion that isn't already in CE...
    const comNoCredit = transitA.stripe.noTransitCreditEuro + transitA.paypal.noTransitCreditEuro;
    // Fees explain part of stripe deficit (wallet gets net not gross)
    const fees = transitA.stripe.feeOnOrders;
    // After .eu, the rest of gap is mostly "incassi a CE senza accredito wallet" + fees + noise
    const afterEu = remain;
    const feesAttributed = Math.min(fees, afterEu);
    const comAttributed = Math.min(comNoCredit, Math.max(0, afterEu - feesAttributed));
    const unexplained = Math.max(0, afterEu - feesAttributed - Math.min(comNoCredit, afterEu - feesAttributed));
    // Actually if comNoCredit is huge (all .com orders), it OVER-explains. Cap: the gap itself.
    // Better narrative:
    // totalGap = |stripe|+|paypal|
    // explained_eu = 166702 (ricavi non a libro — aumenterebbero sia CE che, se registrati bene, transit)
    // explained_fees = fees (wallet ha ricevuto net)
    // residual = totalGap - eu - fees → "incassi .com a CE senza dare transit / payout asymmetry"

    const residualAfterEuFees = totalGap - EU_MISSING_CENTS - fees;
    const composition = {
        totalGap,
        totalGapEuro: euro(totalGap),
        a_euUnregistered: { cents: EU_MISSING_CENTS, euro: euro(EU_MISSING_CENTS) },
        b_feesOnPaidOrders: { cents: fees, euro: euro(fees), note: 'wallet accredita netto; CE spesso lordo' },
        c_residualPatrimoniale: {
            cents: residualAfterEuFees,
            euro: euro(residualAfterEuFees),
            note: 'Incassi .com già a CE senza dare sul transito + asimmetria payout L3 (avere wallet senza dare ricavo). comNoCreditSum è tetto lato ordini, non addendo diretto.',
            comOrdersWithoutTransitDare: { n: transitA.stripe.noTransitCreditN + transitA.paypal.noTransitCreditN, euro: euro(comNoCredit) },
        },
        check: euro(EU_MISSING_CENTS + fees + residualAfterEuFees),
    };

    const out = {
        generatedAt: new Date().toISOString(),
        vincolo: 'SOLA LETTURA (L5bis già eseguito a parte)',
        snapPostL5bis: snap,
        p2_transit: { ...transitA, composition, totalGapPostL5bis: totalGap },
        p3_buoni: { model, discountLike: transitA.discountLikeOrders, listVsItems: transitA.listVsItemsSample },
        p4_floristDoubles: florist,
        p5_isabella: isabella,
        p6_mammi: mammi,
        p7_delta60: delta60,
        p8_margins: margins,
    };

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(join(base, 'dossier_fase4b_post_l5bis_analisi.json'), JSON.stringify(out, null, 2));

    const md = `# Analisi post Lotto 5 / 5-bis (sola lettura)

**Generato:** ${out.generatedAt}  
**Freeze live:** RAI ${snap.rai} · costi ${snap.costi} · banca ${snap.banca} · PayPal ${snap.paypal} · Stripe ${snap.stripe}

---

## 2) Transito come rilevatore

Squilibrio: Stripe **${euro(transit.stripe.transitLedgerCents)}** + PayPal **${euro(transit.paypal.transitLedgerCents)}** = **${composition.totalGapEuro}**

| Quota | Euro | Natura |
|-------|------|--------|
| Ordini .eu non a libro | ${composition.a_euUnregistered.euro} | ricavi mancanti (CE + patrimonio) |
| Commissioni gateway (fee su ordini paid) | ${composition.b_feesOnPaidOrders.euro} | wallet riceve netto |
| Residuo patrimoniale | ${composition.c_residualPatrimoniale.euro} | incassi .com a CE senza *dare* sul wallet + asimmetria payout L3 |
| **Check somma** | **${composition.check}** | |

Ordini paid senza dare transit: Stripe ${transitA.stripe.noTransitCreditN} (${euro(transitA.stripe.noTransitCreditEuro)}) · PayPal ${transitA.paypal.noTransitCreditN} (${euro(transitA.paypal.noTransitCreditEuro)}).

---

## 3) Buoni e sconti — design (non implementato)

**Modello Order oggi:** \`totalPriceCents\` (listino/totale), \`grossAmount\`/\`netAmount\`/\`stripeFee\` (snapshot gateway), \`offerRedemptions\` (buoni). **Mancano** campi espliciti \`discountCents\` e \`amountPaidCents\`.

**Regola proposta:** listino · sconto/buono · **incassato** (= corrispettivo e chiave di match gateway).

Ordini 2026 con \`grossAmount\` ≠ \`totalPriceCents\`: **${transitA.discountLikeOrders.length}** (sample in JSON).

---

## 4) Fioristi contati due volte

| | N | Euro |
|--|---|------|
| FLORIST_PAYOUT 2026 | ${florist.payoutsN} | ${euro(florist.payoutsEuro)} |
| Match bonifico (nome+importo±15g) | ${florist.matchedN} | ${euro(florist.matchedEuro)} |
| **Certi** (importo esatto) | **${florist.certainN}** | **${euro(florist.certainEuro)}** |
| Cumulativi sospetti | ${florist.cumulativeN} | ${euro(florist.cumulativeEuro)} |
| Entrambi ancora in CE (impatto doppio) | — | **${euro(florist.bothInPnlCertainEuro)}** |

---

## 5) Risconto Isabella

Pacchetto corrispettivo **${isabella.packageRevenue}** · ${isabella.deliveriesTotal} consegne · **${isabella.due2027}** dovute 2027.  
Quota ricavo 2027: **${isabella.revenueDefer2027}** (${isabella.revenuePerPose}/posa).  
Quota costo fiorista 2027: **${isabella.costDefer2027}** (${isabella.costPerPose}/posa).  
Ordini in DB: ${isabella.ordersInDb}.

---

## 6) Mammì FT-CS-26-005 / 006

Txn \`txn_3U5R2d4W4pZWhSUs0z67gjHy\` · Stripe amount: **${mammi.stripeAmountEuro || mammi.stripeErr || 'n/d'}**  
Ordini collegati: ${mammi.orders.map((o) => o.orderNumber).join(', ')}  
Pattern txn condivisa altrove: **${mammi.sharedTxnPatterns.length}** gruppi.

---

## 7) Δ €60 banca

| Formula | Valore |
|---------|--------|
| cash PnL (opening + Σ lines) | ${delta60.cashPnlEuro} |
| saldo reale manuale | ${delta60.realManualEuro} (${delta60.realAlignedAt}) |
| calculated quadratura | ${delta60.calculatedEuro} |
| **Δ cash − reale** | **${delta60.diffCashVsRealEuro}** |

Righe esatte ±€60: ${delta60.exactly60.length}.  
**Invariante ufficiale:** ${delta60.invarianteUfficiale}

---

## 8) Margine per ordine (ex carnet)

Paid 2026: ${margins.paidOrders} · esclusi carnet/recurring: ${margins.carnetExcluded} · base: ${margins.exCarnet} · con costo fiorista: ${margins.withFloristCost}  
Ricavi ${margins.totRevenue} − costi fiorista ${margins.totFloristCost} = **margine ${margins.totMargin}** (avg ${margins.avgMargin}, median ${margins.medianMargin}, ${margins.marginPct}).
`;

    writeFileSync(join(base, 'dossier_fase4b_post_l5bis_analisi.md'), md);

    // Append Isabella row to L6 competenza
    const l6path = join(base, 'dossier_fase4b_lotto6_competenza.md');
    const isabellaBlock = `

---

## C) Risconto Isabella Cesaroni (aggiornato post-L5)

Pacchetto prepagato corrispettivo **${isabella.packageRevenue}** (${isabella.deliveriesTotal} consegne).  
**${isabella.due2027} consegne** ancora dovute fino alla primavera 2027.

| | Quota 2027 |
|--|------------|
| Ricavo da riscontare | **${isabella.revenueDefer2027}** (${isabella.revenuePerPose} × ${isabella.due2027}) |
| Costo fiorista da riscontare | **${isabella.costDefer2027}** (${isabella.costPerPose} × ${isabella.due2027}) |

Operativo: 3 fatte · 1 il 12/09/2026 · 7 aperte.
`;
    try {
        const prev = require('fs').readFileSync(l6path, 'utf8') as string;
        if (!prev.includes('## C) Risconto Isabella')) {
            appendFileSync(l6path, isabellaBlock);
        }
    } catch {
        /* skip */
    }

    console.log(
        JSON.stringify(
            {
                snap,
                transitGap: composition.totalGapEuro,
                floristCertain: euro(florist.certainEuro),
                floristDoubleHit: euro(florist.bothInPnlCertainEuro),
                isabellaRev2027: isabella.revenueDefer2027,
                mammiStripe: mammi.stripeAmountEuro || mammi.stripeErr,
                sharedTxns: mammi.sharedTxnPatterns.length,
                delta60: delta60.diffCashVsRealEuro,
                margin: margins.totMargin,
                discountLikeN: transitA.discountLikeOrders.length,
            },
            null,
            2
        )
    );
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
