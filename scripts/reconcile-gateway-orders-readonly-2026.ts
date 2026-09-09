/**
 * READ-ONLY — riconciliazione incassi gateway ↔ ordini (email / nome+data).
 * Nessuna scrittura DB.
 *
 * Uso: npx tsx scripts/reconcile-gateway-orders-readonly-2026.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { classifyPaypalGatewayMovement } from '@/lib/financial/paypalClassify';
import { parsePaypalSourceKey } from '@/lib/financial/paypalSourceKeys';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';

type MatchKind = 'already_linked' | 'tx_id' | 'email' | 'name_date' | 'unmatched';

type IncassoProbe = {
    gateway: 'Stripe' | 'PayPal';
    transactionId: string;
    grossCents: number;
    paymentDate: Date;
    orderId: string | null;
    email: string | null;
    payerName: string | null;
    /** ID da confrontare con Order.stripeTransactionId (txn_/pi_/ch_/…). */
    linkIds: string[];
};

function quarterBounds(year: number, quarter: TaxQuarter) {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999));
    return { start, end };
}

function normEmail(v: string | null | undefined): string | null {
    const e = (v || '').trim().toLowerCase();
    return e.includes('@') ? e : null;
}

function normName(v: string | null | undefined): string {
    return (v || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function daysApart(a: Date, b: Date): number {
    const ms = Math.abs(a.getTime() - b.getTime());
    return ms / (1000 * 60 * 60 * 24);
}

function amountConfirms(orderGross: number | null, listino: number, incasso: number): boolean {
    const candidates = [orderGross, listino].filter((n): n is number => n != null && n > 0);
    if (candidates.length === 0) return false;
    const abs = Math.abs(incasso);
    return candidates.some((c) => Math.abs(c - abs) <= 50 || Math.abs(c - abs) / Math.max(c, abs) <= 0.08);
}

async function loadStripeProbes(start: Date, end: Date): Promise<IncassoProbe[]> {
    const rows = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: start, lte: end },
            type: { in: ['charge', 'payment', 'payment_refund', 'refund'] },
        },
        select: {
            stripeId: true,
            sourceId: true,
            type: true,
            amountCents: true,
            createdAtStripe: true,
            orderId: true,
            reportingCategory: true,
            description: true,
            metadataJson: true,
        },
        take: 8000,
    });
    const out: IncassoProbe[] = [];
    for (const r of rows) {
        const t = (r.type || '').toLowerCase();
        const isRefund = t.includes('refund');
        let gross = r.amountCents;
        if (!isRefund && gross < 0) gross = Math.abs(gross);
        if (isRefund && gross > 0) gross = -gross;
        if (gross === 0) continue;
        if (/fee|payout|transfer|adjustment/i.test(r.reportingCategory || '')) continue;
        const txId = (r.sourceId || r.stripeId || '').trim();
        if (!txId) continue;
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const rawStripeId =
            typeof meta.rawStripeId === 'string'
                ? meta.rawStripeId
                : r.stripeId.replace(/^stripe_(?:com|eu)_tx_/, '').replace(/^stripe_tx_/, '');
        const email =
            normEmail(typeof meta.receiptEmail === 'string' ? meta.receiptEmail : null) ||
            normEmail(typeof meta.billingEmail === 'string' ? meta.billingEmail : null) ||
            normEmail(typeof meta.customerEmail === 'string' ? meta.customerEmail : null) ||
            normEmail(typeof meta.email === 'string' ? meta.email : null);
        const payerName =
            (typeof meta.billingName === 'string' && meta.billingName) ||
            (typeof meta.customerName === 'string' && meta.customerName) ||
            (typeof meta.name === 'string' && meta.name) ||
            null;
        out.push({
            gateway: 'Stripe',
            transactionId: txId,
            grossCents: gross,
            paymentDate: r.createdAtStripe,
            orderId: r.orderId,
            email,
            payerName,
            linkIds: [txId, r.stripeId, rawStripeId, r.sourceId || ''].filter(Boolean),
        });
    }
    return out;
}

async function loadPaypalProbes(start: Date, end: Date): Promise<IncassoProbe[]> {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'PAYPAL_' },
            accountingDate: { gte: start, lte: end },
        },
        select: {
            sourceKey: true,
            orderId: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            metadataJson: true,
            direction: true,
        },
        take: 8000,
    });
    const out: IncassoProbe[] = [];
    for (const r of rows) {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const classified = classifyPaypalGatewayMovement({
            description: r.description || '',
            grossCents: r.totalCents,
            feeCents: typeof meta.feeCents === 'number' ? meta.feeCents : undefined,
            eventCode: typeof meta.eventCode === 'string' ? meta.eventCode : null,
            payerEmail: typeof meta.payerEmail === 'string' ? meta.payerEmail : null,
            counterpartyName:
                typeof meta.counterpartyName === 'string' ? meta.counterpartyName : null,
        });
        if (classified.movementKind !== 'incasso' && classified.movementKind !== 'rimborso') {
            continue;
        }
        const metaGross =
            typeof meta.grossCents === 'number'
                ? meta.grossCents
                : typeof meta.amountCents === 'number'
                  ? meta.amountCents
                  : null;
        let gross =
            metaGross != null && Number.isFinite(metaGross)
                ? Math.round(metaGross)
                : Math.abs(r.totalCents || 0);
        if (classified.movementKind === 'rimborso') gross = -Math.abs(gross);
        else if (r.direction === 'USCITA') continue;
        if (gross === 0) continue;
        const parsed = parsePaypalSourceKey(r.sourceKey);
        const txId =
            (typeof meta.transactionId === 'string' && meta.transactionId) ||
            parsed?.transactionId ||
            r.sourceKey.replace(/^PAYPAL_/, '');
        out.push({
            gateway: 'PayPal',
            transactionId: txId,
            grossCents: gross,
            paymentDate: r.accountingDate,
            orderId: r.orderId,
            email: normEmail(typeof meta.payerEmail === 'string' ? meta.payerEmail : null),
            payerName:
                (typeof meta.counterpartyName === 'string' && meta.counterpartyName) ||
                (typeof meta.payerName === 'string' && meta.payerName) ||
                null,
            linkIds: [txId, parsed?.canonicalKey || '', r.sourceKey].filter(Boolean),
        });
    }
    return out;
}

async function loadOrders(start: Date, end: Date) {
    // Finestra ampia: ordine può essere registrato giorni dopo l’incasso (.eu → .com)
    const looseStart = new Date(start);
    looseStart.setUTCDate(looseStart.getUTCDate() - 14);
    const looseEnd = new Date(end);
    looseEnd.setUTCDate(looseEnd.getUTCDate() + 14);

    return prisma.order.findMany({
        where: {
            deletedAt: null,
            partnerPaymentStatus: 'PAID',
            OR: [
                { createdAt: { gte: looseStart, lte: looseEnd } },
                { deliveryDate: { gte: looseStart, lte: looseEnd } },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            buyerEmail: true,
            buyerFullName: true,
            createdAt: true,
            deliveryDate: true,
            totalPriceCents: true,
            grossAmount: true,
            stripeTransactionId: true,
        },
        take: 20000,
    });
}

async function analyzeQuarter(year: number, quarter: TaxQuarter) {
    const { start, end } = quarterBounds(year, quarter);
    const [stripe, paypal, orders, gatewayBuild] = await Promise.all([
        loadStripeProbes(start, end),
        loadPaypalProbes(start, end),
        loadOrders(start, end),
        buildGatewayCorrispettivi({ start, end }),
    ]);

    const byTx = new Map<string, IncassoProbe>();
    for (const g of [...stripe, ...paypal]) {
        const key = `${g.gateway}:${g.transactionId}`.toLowerCase();
        const prev = byTx.get(key);
        if (!prev || Math.abs(g.grossCents) > Math.abs(prev.grossCents)) byTx.set(key, g);
    }
    const incassi = [...byTx.values()];

    const ordersByEmail = new Map<string, typeof orders>();
    const ordersByTxId = new Map<string, (typeof orders)[number]>();
    for (const o of orders) {
        const e = normEmail(o.buyerEmail);
        if (e) {
            const list = ordersByEmail.get(e) || [];
            list.push(o);
            ordersByEmail.set(e, list);
        }
        if (o.stripeTransactionId?.trim()) {
            ordersByTxId.set(o.stripeTransactionId.trim().toLowerCase(), o);
        }
    }

    const withTx = await prisma.order.findMany({
        where: {
            deletedAt: null,
            partnerPaymentStatus: 'PAID',
            stripeTransactionId: { not: null },
            createdAt: {
                gte: new Date(Date.UTC(year, 0, 1)),
                lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
            },
        },
        select: {
            id: true,
            orderNumber: true,
            buyerEmail: true,
            buyerFullName: true,
            createdAt: true,
            deliveryDate: true,
            totalPriceCents: true,
            grossAmount: true,
            stripeTransactionId: true,
        },
        take: 20000,
    });
    for (const o of withTx) {
        if (o.stripeTransactionId?.trim()) {
            ordersByTxId.set(o.stripeTransactionId.trim().toLowerCase(), o);
        }
        const e = normEmail(o.buyerEmail);
        if (e) {
            const list = ordersByEmail.get(e) || [];
            if (!list.some((x) => x.id === o.id)) list.push(o);
            ordersByEmail.set(e, list);
        }
    }

    const allOrdersForName = [...new Map([...orders, ...withTx].map((o) => [o.id, o])).values()];

    const counts = {
        totalIncassi: incassi.length,
        grossAllCents: incassi.reduce((s, i) => s + Math.abs(i.grossCents), 0),
        already_linked: 0,
        tx_id: 0,
        tx_id_amount_ok: 0,
        email: 0,
        email_amount_ok: 0,
        name_date: 0,
        name_date_amount_ok: 0,
        unmatched: 0,
        unmatchedGrossCents: 0,
        noEmailOnIncasso: 0,
        noNameOnIncasso: 0,
    };

    const linkedInBuild = new Set(
        gatewayBuild.rows
            .filter((r) => r.orderId)
            .map((r) => `${r.canaleIncasso}:${r.transactionId}`.toLowerCase())
    );

    for (const inc of incassi) {
        const key = `${inc.gateway}:${inc.transactionId}`.toLowerCase();
        let kind: MatchKind = 'unmatched';
        let amountOk = false;
        let matchedOrder: (typeof allOrdersForName)[number] | null = null;

        if (inc.orderId || linkedInBuild.has(key)) {
            kind = 'already_linked';
        } else {
            for (const id of inc.linkIds) {
                const hit = ordersByTxId.get(id.toLowerCase());
                if (hit) {
                    kind = 'tx_id';
                    matchedOrder = hit;
                    break;
                }
            }

            if (kind === 'unmatched') {
                if (!inc.email) counts.noEmailOnIncasso += 1;
                if (!normName(inc.payerName)) counts.noNameOnIncasso += 1;

                if (inc.email && ordersByEmail.has(inc.email)) {
                    const candidates = ordersByEmail.get(inc.email)!;
                    kind = 'email';
                    matchedOrder = candidates[0];
                    amountOk = candidates.some((o) =>
                        amountConfirms(
                            o.grossAmount != null ? Math.round(o.grossAmount * 100) : null,
                            o.totalPriceCents,
                            inc.grossCents
                        )
                    );
                } else {
                    const name = normName(inc.payerName);
                    if (name.length >= 4) {
                        const hits = allOrdersForName.filter((o) => {
                            const on = normName(o.buyerFullName);
                            if (!on || on.length < 4) return false;
                            if (on !== name && !on.includes(name) && !name.includes(on)) {
                                return false;
                            }
                            return daysApart(o.createdAt, inc.paymentDate) <= 3;
                        });
                        if (hits.length > 0) {
                            kind = 'name_date';
                            matchedOrder = hits[0];
                            amountOk = hits.some((o) =>
                                amountConfirms(
                                    o.grossAmount != null
                                        ? Math.round(o.grossAmount * 100)
                                        : null,
                                    o.totalPriceCents,
                                    inc.grossCents
                                )
                            );
                        }
                    }
                }
            } else if (matchedOrder) {
                amountOk = amountConfirms(
                    matchedOrder.grossAmount != null
                        ? Math.round(matchedOrder.grossAmount * 100)
                        : null,
                    matchedOrder.totalPriceCents,
                    inc.grossCents
                );
            }
        }

        if (kind === 'already_linked') counts.already_linked += 1;
        else if (kind === 'tx_id') {
            counts.tx_id += 1;
            if (amountOk) counts.tx_id_amount_ok += 1;
        } else if (kind === 'email') {
            counts.email += 1;
            if (amountOk) counts.email_amount_ok += 1;
        } else if (kind === 'name_date') {
            counts.name_date += 1;
            if (amountOk) counts.name_date_amount_ok += 1;
        } else {
            counts.unmatched += 1;
            counts.unmatchedGrossCents += Math.abs(inc.grossCents);
        }
    }

    return {
        period: `T${quarter} ${year}`,
        mancanteShareBuild: gatewayBuild.totals.mancanteShare,
        mancanteGrossCents: gatewayBuild.totals.mancanteGrossCents,
        determinataGrossCents: gatewayBuild.totals.determinataGrossCents,
        presuntaGrossCents: gatewayBuild.totals.presuntaGrossCents,
        grossAllBuildCents: gatewayBuild.totals.grossAllCents,
        ordersWithStripeTxIdInYear: withTx.length,
        ...counts,
        recoverableSoft: counts.tx_id + counts.email + counts.name_date,
        stillDarkAfterSoftMatch: counts.unmatched,
    };
}

async function main() {
    const year = 2026;
    const results = [];
    for (const q of [1, 2, 3] as TaxQuarter[]) {
        console.error(`Analyzing T${q}...`);
        results.push(await analyzeQuarter(year, q));
    }

    const outDir = path.join(process.cwd(), 'docs/verbali');
    const jsonPath = path.join(outDir, '09-09-2026-reconcile-gateway-orders-readonly.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

    const lines = [
        '# Riconciliazione sola lettura — incassi ↔ ordini (2026 T1–T3)',
        '',
        `**Generato:** ${new Date().toISOString()}`,
        '**Scritture DB:** nessuna',
        '',
        'Gerarchia: (1) già collegato · (2) `Order.stripeTransactionId` ↔ id gateway · (3) email · (4) nome + data ±3 giorni · importo solo conferma.',
        '',
        '| Periodo | Incassi | Già collegati | Match tx id | Match email | Match nome+data | Scoperti | Lordo scoperto | Mancante build |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ];
    for (const r of results) {
        lines.push(
            `| ${r.period} | ${r.totalIncassi} | ${r.already_linked} | ${r.tx_id} (imp.OK ${r.tx_id_amount_ok}) | ${r.email} (imp.OK ${r.email_amount_ok}) | ${r.name_date} (imp.OK ${r.name_date_amount_ok}) | ${r.unmatched} | € ${(r.unmatchedGrossCents / 100).toFixed(2)} | ${(r.mancanteShareBuild * 100).toFixed(1)}% |`
        );
    }
    lines.push('');
    lines.push('## Note');
    lines.push('');
    lines.push('- «Già collegati» = `orderId` sul movimento gateway **oppure** riga corrispettivi con `orderId` (anche PRESUNTA).');
    lines.push('- «Match tx id» = `Order.stripeTransactionId` uguale a `txn_` / `pi_` / `ch_` / source del movimento (senza scrivere).');
    lines.push('- Email/nome sui movimenti Stripe in DB sono quasi assenti (`metadataJson` sync senza receipt email): match email/nome sottostimano finché non si arricchisce il sync.');
    lines.push('- Blocco export MANCANTE >30% resta attivo.');
    lines.push('');

    const mdPath = path.join(outDir, '09-09-2026-reconcile-gateway-orders-readonly.md');
    fs.writeFileSync(mdPath, lines.join('\n'));
    console.log(JSON.stringify(results, null, 2));
    console.error(`Wrote ${jsonPath}`);
    console.error(`Wrote ${mdPath}`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
