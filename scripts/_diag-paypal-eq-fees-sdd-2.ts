/**
 * Continuazione diagnosi: Tariffa CSV, FT-MB/FT-CS, stripe_eu orfani, fee reversed.
 */
import fs from 'node:fs';
import Papa from 'papaparse';
import prisma from '@/lib/prisma';
import { sumPaypalPaymentAccountCents } from '@/lib/financial/gatewayTransitBalance';
import { controlC11, controlC12, controlC13 } from '@/lib/financial/dossierFiscalControls';

function parseEuro(s: unknown) {
    if (s == null || s === '') return 0;
    const t = String(s).trim().replace(/€/g, '').replace(/\s/g, '');
    if (t.includes(',') && t.includes('.')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0;
    if (t.includes(',')) return parseFloat(t.replace(',', '.')) || 0;
    return parseFloat(t) || 0;
}

async function main() {
    const csvPath = '/Users/floremoria/Downloads/Transazioni PayPal FloreMoria 2026.CSV';
    const text = fs.readFileSync(csvPath, 'utf8');
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

    const marked = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            metadataJson: { path: ['paypalSalesReport'], equals: true },
            totalCents: { gt: 0 },
        },
        select: { sourceKey: true, totalCents: true, accountingDate: true },
    });
    const txIds = marked.map((m) => m.sourceKey.replace(/^PAYPAL_TX:/, ''));
    const csvById = new Map<string, any>();
    for (const row of parsed.data as any[]) {
        const id = String(row['Codice transazione'] || '');
        if (id) csvById.set(id, row);
    }

    let csvSalesFee = 0;
    const feeGaps: any[] = [];
    for (const id of txIds) {
        const row = csvById.get(id);
        const ledgerFee = await prisma.financialLedgerEntry.findFirst({
            where: { sourceKey: `PAYPAL_FEE:${id}` },
            select: { totalCents: true, reversedAt: true },
        });
        if (!row) {
            feeGaps.push({ id, reason: 'no_csv', ledger: ledgerFee });
            continue;
        }
        const feeN = Math.abs(parseEuro(row['Tariffa']));
        csvSalesFee += feeN;
        const ledgerAbs = ledgerFee && !ledgerFee.reversedAt ? Math.abs(ledgerFee.totalCents) / 100 : 0;
        if (Math.abs(feeN - ledgerAbs) > 0.02 || !ledgerFee || ledgerFee.reversedAt) {
            feeGaps.push({
                id,
                date: row['Data'],
                name: String(row['Nome'] || '').slice(0, 40),
                gross: parseEuro(row['Lordo']),
                csvFee: feeN,
                ledgerAbs,
                reversed: !!ledgerFee?.reversedAt,
            });
        }
    }
    console.log(JSON.stringify({ markedN: marked.length, markedEuro: marked.reduce((a, m) => a + m.totalCents, 0) / 100, csvSalesFee: +csvSalesFee.toFixed(2), feeGaps }, null, 2));

    // All reversed fees
    const revFees = await prisma.financialLedgerEntry.findMany({
        where: { sourceKey: { startsWith: 'PAYPAL_FEE:' }, reversedAt: { not: null } },
        select: { sourceKey: true, totalCents: true, accountingDate: true, description: true, metadataJson: true },
    });
    console.log(
        'reversedFees',
        revFees.map((f) => ({
            k: f.sourceKey,
            e: f.totalCents / 100,
            d: f.accountingDate.toISOString().slice(0, 10),
            meta: f.metadataJson,
        }))
    );

    // Extra TX_IN not in report
    const extraIn = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'PAYPAL_TX:' },
            totalCents: { gt: 0 },
            NOT: { metadataJson: { path: ['paypalSalesReport'], equals: true } },
        },
        select: {
            sourceKey: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            metadataJson: true,
        },
        orderBy: { accountingDate: 'asc' },
    });
    console.log(
        'extraTxIn',
        {
            n: extraIn.length,
            euro: extraIn.reduce((a, x) => a + x.totalCents, 0) / 100,
            rows: extraIn.map((x) => ({
                k: x.sourceKey,
                e: x.totalCents / 100,
                d: x.accountingDate.toISOString().slice(0, 10),
                desc: (x.description || '').slice(0, 70),
            })),
        }
    );

    // FT-MB / FT-CS
    const orders = await prisma.order.findMany({
        where: {
            orderNumber: {
                in: [
                    'FT-MB-26-001',
                    'FT-CS-26-005',
                    'FT-CS-26-006',
                    'FT-PA-26-008',
                    'FT-SA-26-001',
                    'FF-CO-26-001',
                ],
            },
        },
        select: {
            id: true,
            orderNumber: true,
            buyerFullName: true,
            totalPriceCents: true,
            createdAt: true,
            stripeTransactionId: true,
            paymentMethodLabel: true,
            paidAt: true,
        },
    });
    for (const o of orders) {
        const led = await prisma.financialLedgerEntry.findMany({
            where: { orderId: o.id },
            select: {
                sourceKey: true,
                totalCents: true,
                reversedAt: true,
                accountingDate: true,
                category: true,
                description: true,
            },
        });
        console.log(
            JSON.stringify({
                order: o.orderNumber,
                buyer: o.buyerFullName,
                euro: (o.totalPriceCents || 0) / 100,
                created: o.createdAt.toISOString(),
                paidAt: o.paidAt?.toISOString() ?? null,
                stripe: o.stripeTransactionId,
                pm: o.paymentMethodLabel,
                ledger: led.map((l) => ({
                    k: l.sourceKey,
                    e: l.totalCents / 100,
                    rev: !!l.reversedAt,
                    d: l.accountingDate.toISOString().slice(0, 10),
                    c: l.category,
                })),
            })
        );
    }

    // PayPal €37.99 around 19/07
    const pp = await prisma.financialLedgerEntry.findMany({
        where: {
            sourceKey: { startsWith: 'PAYPAL_TX:' },
            totalCents: { in: [3799, -3799] },
        },
        select: {
            sourceKey: true,
            totalCents: true,
            reversedAt: true,
            accountingDate: true,
            description: true,
            metadataJson: true,
            orderId: true,
        },
    });
    console.log(
        'paypal3799',
        pp.map((p) => ({
            k: p.sourceKey,
            e: p.totalCents / 100,
            d: p.accountingDate.toISOString().slice(0, 10),
            rev: !!p.reversedAt,
            report: !!(p.metadataJson as any)?.paypalSalesReport,
            desc: (p.description || '').slice(0, 90),
            oid: p.orderId,
        }))
    );

    // Orders €31.48 on 17/08 calendar (Europe)
    const dayOrders = await prisma.order.findMany({
        where: {
            totalPriceCents: 3148,
            createdAt: {
                gte: new Date('2026-08-16T22:00:00.000Z'),
                lt: new Date('2026-08-17T22:00:00.000Z'),
            },
        },
        select: {
            id: true,
            orderNumber: true,
            buyerFullName: true,
            createdAt: true,
            stripeTransactionId: true,
            paymentMethodLabel: true,
            paidAt: true,
        },
    });
    // Also search by order number pattern for Aug 17 mammi
    const mammi = await prisma.order.findMany({
        where: {
            OR: [
                { orderNumber: { in: ['FT-CS-26-005', 'FT-CS-26-006', 'FT-PA-26-008'] } },
                {
                    buyerFullName: { contains: 'Mamm', mode: 'insensitive' },
                    totalPriceCents: 3148,
                    createdAt: {
                        gte: new Date('2026-08-15'),
                        lt: new Date('2026-08-20'),
                    },
                },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            buyerFullName: true,
            createdAt: true,
            stripeTransactionId: true,
            paymentMethodLabel: true,
            paidAt: true,
            totalPriceCents: true,
        },
    });
    console.log(
        'aug17_3148',
        { dayOrders: dayOrders.length, mammi: mammi.map((o) => ({
            n: o.orderNumber,
            buyer: o.buyerFullName,
            c: o.createdAt.toISOString(),
            stripe: o.stripeTransactionId,
            pm: o.paymentMethodLabel,
            paid: o.paidAt?.toISOString() ?? null,
            e: (o.totalPriceCents || 0) / 100,
        })) }
    );

    for (const o of mammi) {
        const led = await prisma.financialLedgerEntry.findMany({
            where: { orderId: o.id },
            select: {
                sourceKey: true,
                totalCents: true,
                reversedAt: true,
                accountingDate: true,
                category: true,
            },
        });
        // also stripe/paypal same day amount
        console.log(o.orderNumber, 'ledger', led);
    }

    // stripe_eu orphans census
    const stripeEu = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, sourceKey: { startsWith: 'STRIPE_TX:stripe_eu' } },
        select: {
            sourceKey: true,
            totalCents: true,
            accountingDate: true,
            orderId: true,
            description: true,
            metadataJson: true,
        },
    });
    const expectedEu = 1121.18;
    const raw = stripeEu.reduce((a, s) => a + Math.abs(s.totalCents), 0) / 100;
    const linked = stripeEu.filter((s) => s.orderId);
    const unlinked = stripeEu.filter((s) => !s.orderId);
    const oids = [...new Set(linked.map((s) => s.orderId!))];
    const ords = await prisma.order.findMany({
        where: { id: { in: oids } },
        select: { id: true, orderNumber: true, totalPriceCents: true, buyerEmail: true, buyerFullName: true },
    });
    // Heuristic: domain from order number prefix / email
    const comLike = linked.filter((s) => {
        const o = ords.find((x) => x.id === s.orderId);
        return o && !/-EU-|eu\.|@/.test('') && (o.orderNumber.startsWith('FF-') || o.orderNumber.startsWith('FT-'));
    });

    // Match list .eu expected vs actual: orphans = rows whose amount+date don't match the eu list attachments
    // For census: classify unlinked + linked-to-.com orders
    const byOrder = linked.map((s) => {
        const o = ords.find((x) => x.id === s.orderId);
        return {
            k: s.sourceKey,
            e: Math.abs(s.totalCents) / 100,
            d: s.accountingDate.toISOString().slice(0, 10),
            order: o?.orderNumber,
            buyer: o?.buyerFullName,
        };
    });

    // Previous apply said orphans €807.80 = 1928.98 - 1121.18
    // Identify which rows are NOT in the €1121.18 set by subtracting matched eu list
    // Use prior sales-model expected list if present
    let matchedEuKeys: string[] = [];
    try {
        const sm = JSON.parse(
            fs.readFileSync('docs/verbali/11-09-2026-paypal-sales-model.json', 'utf8')
        );
        matchedEuKeys = (sm.punto2_fuoriGateway?.stripeEuNotDouble || []).map(
            (x: any) => x.stripeKey || x.key
        );
    } catch {
        /* ignore */
    }

    const matchedSet = new Set(matchedEuKeys.filter(Boolean));
    const orphans = stripeEu.filter((s) => !matchedSet.has(s.sourceKey));
    const matched = stripeEu.filter((s) => matchedSet.has(s.sourceKey));

    console.log(
        JSON.stringify(
            {
                stripeEuRaw: { n: stripeEu.length, euro: +raw.toFixed(2), expected: expectedEu, orphanEuro: +(raw - expectedEu).toFixed(2) },
                matchedFromPrior: { n: matched.length, euro: matched.reduce((a, s) => a + Math.abs(s.totalCents), 0) / 100 },
                orphans: {
                    n: orphans.length,
                    euro: orphans.reduce((a, s) => a + Math.abs(s.totalCents), 0) / 100,
                    rows: orphans.map((s) => ({
                        k: s.sourceKey,
                        e: Math.abs(s.totalCents) / 100,
                        d: s.accountingDate.toISOString().slice(0, 10),
                        orderId: s.orderId,
                        order: ords.find((o) => o.id === s.orderId)?.orderNumber,
                        buyer: ords.find((o) => o.id === s.orderId)?.buyerFullName,
                        desc: (s.description || '').slice(0, 80),
                        chargeId: (s.metadataJson as any)?.chargeId || (s.metadataJson as any)?.stripeChargeId,
                    })),
                },
                unlinkedN: unlinked.length,
                byOrderSample: byOrder.slice(0, 5),
            },
            null,
            2
        )
    );

    const ppBal = await sumPaypalPaymentAccountCents();
    console.log('paypalBal', ppBal / 100);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
