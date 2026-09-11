/**
 * Diagnosi equazione PayPal: SDD, fee CSV, residuali fuori gateway, stripe_eu orfani.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import prisma from '@/lib/prisma';
import { sumPaypalPaymentAccountCents } from '@/lib/financial/gatewayTransitBalance';
import { loadPaypalSalesReport } from '@/lib/financial/paypalSalesReports';

function parseEuro(s: unknown) {
    if (s == null || s === '') return 0;
    const t = String(s).trim().replace(/€/g, '').replace(/\s/g, '');
    if (t.includes(',') && t.includes('.')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0;
    if (t.includes(',')) return parseFloat(t.replace(',', '.')) || 0;
    return parseFloat(t) || 0;
}

async function main() {
    const bal = await sumPaypalPaymentAccountCents();
    const accountCodes = ['10200', 'Banca c/o PayPal', 'Conto PayPal'];
    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null },
        select: {
            totalCents: true,
            metadataJson: true,
            sourceKey: true,
            category: true,
            description: true,
            accountingDate: true,
            orderId: true,
        },
        take: 50000,
    });

    type B = { n: number; cents: number; samples: string[] };
    const buckets: Record<string, B> = {};
    let balance = 0;
    for (const r of rows) {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        if (meta.fuoriGateway || meta.fuoriGatewayLegacyJson) continue;
        const dare = String(meta.dareAccount || '');
        const avere = String(meta.avereAccount || '');
        const dareIs = accountCodes.some((c) => dare.includes(c));
        const avereIs = accountCodes.some((c) => avere.includes(c));
        if (!dareIs && !avereIs) continue;
        let delta = 0;
        if (dareIs && !avereIs) delta = Math.abs(r.totalCents);
        else if (avereIs && !dareIs) delta = -Math.abs(r.totalCents);
        else continue;
        balance += delta;
        let bucket = 'OTHER';
        if (meta.sddFundingBatch) bucket = 'SDD_FINECO';
        else if (r.sourceKey.startsWith('PAYPAL_TX:REPORT_')) bucket = 'PAYPAL_TX_SYNTH';
        else if (r.sourceKey.startsWith('PAYPAL_TX:'))
            bucket = r.totalCents > 0 ? 'PAYPAL_TX_IN' : 'PAYPAL_TX_OUT';
        else if (r.sourceKey.startsWith('PAYPAL_FEE:')) bucket = 'PAYPAL_FEE';
        else if (r.sourceKey.startsWith('PAYPAL_PAYOUT:')) bucket = 'PAYPAL_PAYOUT';
        else if (r.sourceKey.startsWith('PAYPAL_REFUND:')) bucket = 'PAYPAL_REFUND';
        else if (r.sourceKey.startsWith('BANK_LINE:')) bucket = 'BANK_LINE_OTHER';
        else bucket = `${r.sourceKey.split(':')[0] || 'OTHER'}${dareIs ? '_DARE' : '_AVERE'}`;
        if (!buckets[bucket]) buckets[bucket] = { n: 0, cents: 0, samples: [] };
        buckets[bucket].n++;
        buckets[bucket].cents += delta;
        if (buckets[bucket].samples.length < 2) {
            buckets[bucket].samples.push(
                `${r.accountingDate.toISOString().slice(0, 10)} ${r.sourceKey} tc=${r.totalCents} Δ=${delta}`
            );
        }
    }
    console.log(JSON.stringify({ sumPaypal: bal / 100, rebuild: balance / 100, buckets: Object.entries(buckets)
        .map(([k, v]) => ({ k, n: v.n, euro: +(v.cents / 100).toFixed(2), samples: v.samples }))
        .sort((a, b) => Math.abs(b.euro) - Math.abs(a.euro)) }, null, 2));

    const allFees = await prisma.financialLedgerEntry.findMany({
        where: { sourceKey: { startsWith: 'PAYPAL_FEE:' } },
        select: {
            sourceKey: true,
            totalCents: true,
            reversedAt: true,
            description: true,
            accountingDate: true,
            metadataJson: true,
        },
    });
    console.log(
        'fees',
        JSON.stringify(
            {
                active: {
                    n: allFees.filter((f) => !f.reversedAt).length,
                    euro: allFees
                        .filter((f) => !f.reversedAt)
                        .reduce((a, f) => a + Math.abs(f.totalCents), 0) / 100,
                },
                reversed: allFees
                    .filter((f) => f.reversedAt)
                    .map((f) => ({
                        k: f.sourceKey,
                        e: f.totalCents / 100,
                        d: f.accountingDate.toISOString().slice(0, 10),
                        desc: (f.description || '').slice(0, 100),
                    })),
            },
            null,
            2
        )
    );

    // Sales report fees
    const sales = loadPaypalSalesReport('YTD');
    console.log('sales YTD', sales.n, sales.euro);

    for (const f of [
        'docs/verbali/paypal-sales-reports/T1-2026.csv',
        'docs/verbali/paypal-sales-reports/T2-2026.csv',
        'docs/verbali/paypal-sales-reports/T3-2026-PROVVISORIO-1lug-10set.csv',
        'docs/verbali/paypal-sales-reports/sales-report-HAYUMYJTWLRTE-2026-01-01-2026-09-10.csv',
    ]) {
        if (!fs.existsSync(f)) {
            console.log('missing', f);
            continue;
        }
        const text = fs.readFileSync(f, 'utf8');
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        const fields = parsed.meta.fields || [];
        const feeKeys = fields.filter((x) => /fee|comm/i.test(x));
        const gKey = fields.find((x) => /gross|lordo/i.test(x)) || fields[0];
        let fee = 0;
        let gross = 0;
        let n = 0;
        const sampleFees: any[] = [];
        for (const row of parsed.data as any[]) {
            const g = parseEuro(row[gKey!]);
            const fe = feeKeys.length ? parseEuro(row[feeKeys[0]]) : 0;
            if (g || fe) {
                n++;
                gross += Math.abs(g);
                fee += Math.abs(fe);
                if (sampleFees.length < 5 && fe)
                    sampleFees.push({ g, fe, row: Object.fromEntries(feeKeys.map((k) => [k, row[k]])) });
            }
        }
        console.log(
            JSON.stringify({
                file: path.basename(f),
                fields,
                feeKeys,
                n,
                gross: +gross.toFixed(2),
                fee: +fee.toFixed(2),
                sampleFees,
            })
        );
    }

    // Full PayPal activity CSV
    const csvPath = '/Users/floremoria/Downloads/Transazioni PayPal FloreMoria 2026.CSV';
    if (fs.existsSync(csvPath)) {
        const text = fs.readFileSync(csvPath, 'utf8');
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        const byType: Record<string, { n: number; fee: number; gross: number }> = {};
        let feeSum = 0;
        for (const row of parsed.data as any[]) {
            const type = String(row['Tipo'] || row['Type'] || '');
            const feeN = parseEuro(row['Commissione'] ?? row['Fee']);
            const grossN = parseEuro(row['Lordo'] ?? row['Gross']);
            if (Math.abs(feeN) > 0.001) {
                if (!byType[type]) byType[type] = { n: 0, fee: 0, gross: 0 };
                byType[type].n++;
                byType[type].fee += feeN;
                byType[type].gross += grossN;
                feeSum += feeN;
            }
        }
        console.log('activityCsv', { feeSum: +feeSum.toFixed(2), byType, fields: parsed.meta.fields });
    }

    // FT-MB + FT-CS
    const orders = await prisma.order.findMany({
        where: { orderNumber: { in: ['FT-MB-26-001', 'FT-CS-26-005', 'FT-CS-26-006', 'FT-PA-26-008'] } },
        select: {
            id: true,
            orderNumber: true,
            buyerFullName: true,
            totalCents: true,
            createdAt: true,
            stripeTransactionId: true,
            paymentMethodLabel: true,
            paidAt: true,
        },
    });
    console.log('targetOrders', orders);

    const manuals = await prisma.financialLedgerEntry.findMany({
        where: {
            OR: [
                { orderId: { in: orders.map((o) => o.id) } },
                { sourceKey: { contains: 'cmsx9hwv00001k104uoepnd89' } }, // FT-CS-26-005 key from prior
                { sourceKey: { contains: 'cmrt166og0000jw0432noy5dn' } }, // FT-MB
            ],
        },
        select: {
            sourceKey: true,
            totalCents: true,
            reversedAt: true,
            accountingDate: true,
            orderId: true,
            description: true,
            category: true,
        },
    });
    console.log('relatedLedger', manuals);

    // PayPal TX near 19/07 €37.99 and 17/08 €31.48
    const near = await prisma.financialLedgerEntry.findMany({
        where: {
            sourceKey: { startsWith: 'PAYPAL_TX:' },
            OR: [
                { totalCents: { in: [3799, -3799, 3148, -3148] } },
            ],
        },
        select: {
            sourceKey: true,
            totalCents: true,
            reversedAt: true,
            accountingDate: true,
            description: true,
            metadataJson: true,
        },
        orderBy: { accountingDate: 'asc' },
    });
    console.log(
        'near amounts',
        near.map((n) => ({
            k: n.sourceKey,
            e: n.totalCents / 100,
            d: n.accountingDate.toISOString().slice(0, 10),
            rev: !!n.reversedAt,
            flag: (n.metadataJson as any)?.paypalSalesReport,
            desc: (n.description || '').slice(0, 60),
        }))
    );

    // stripe_eu census
    const stripeEu = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'STRIPE_TX:stripe_eu' },
        },
        select: {
            sourceKey: true,
            totalCents: true,
            accountingDate: true,
            orderId: true,
            description: true,
            metadataJson: true,
        },
        orderBy: { accountingDate: 'asc' },
    });
    const withOrder = stripeEu.filter((s) => s.orderId);
    const without = stripeEu.filter((s) => !s.orderId);
    const orderIds = [...new Set(withOrder.map((s) => s.orderId!))];
    const ords = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNumber: true, domain: true, totalCents: true },
    });
    const byId = new Map(ords.map((o) => [o.id, o]));
    console.log(
        JSON.stringify(
            {
                stripeEu: {
                    n: stripeEu.length,
                    euro: stripeEu.reduce((a, s) => a + Math.abs(s.totalCents), 0) / 100,
                    withOrderN: withOrder.length,
                    withoutOrderN: without.length,
                    domains: ords.reduce((acc: any, o) => {
                        acc[o.domain || '?'] = (acc[o.domain || '?'] || 0) + 1;
                        return acc;
                    }, {}),
                    sampleNoOrder: without.slice(0, 15).map((s) => ({
                        k: s.sourceKey,
                        e: Math.abs(s.totalCents) / 100,
                        d: s.accountingDate.toISOString().slice(0, 10),
                        desc: (s.description || '').slice(0, 80),
                        meta: s.metadataJson,
                    })),
                    sampleWithOrder: withOrder.slice(0, 10).map((s) => {
                        const o = byId.get(s.orderId!);
                        return {
                            k: s.sourceKey,
                            e: Math.abs(s.totalCents) / 100,
                            d: s.accountingDate.toISOString().slice(0, 10),
                            order: o?.orderNumber,
                            domain: o?.domain,
                        };
                    }),
                },
            },
            null,
            2
        )
    );

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
