import fs from 'node:fs';
import prisma from '@/lib/prisma';

async function main() {
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
                stripe: o.stripeTransactionId,
                pm: o.paymentMethodLabel,
                ledger: led.map((l) => ({
                    k: l.sourceKey,
                    e: l.totalCents / 100,
                    rev: !!l.reversedAt,
                    d: l.accountingDate.toISOString().slice(0, 10),
                    c: l.category,
                    desc: (l.description || '').slice(0, 60),
                })),
            })
        );
    }

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
            desc: (p.description || '').slice(0, 100),
            oid: p.orderId,
        }))
    );

    const mammi = await prisma.order.findMany({
        where: {
            OR: [
                { orderNumber: { in: ['FT-CS-26-005', 'FT-CS-26-006', 'FT-PA-26-008'] } },
                {
                    buyerFullName: { contains: 'Mamm', mode: 'insensitive' },
                    totalPriceCents: 3148,
                    createdAt: { gte: new Date('2026-08-15'), lt: new Date('2026-08-20') },
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
            totalPriceCents: true,
        },
    });
    console.log(
        'mammi',
        mammi.map((o) => ({
            n: o.orderNumber,
            buyer: o.buyerFullName,
            c: o.createdAt.toISOString(),
            stripe: o.stripeTransactionId,
            pm: o.paymentMethodLabel,
        }))
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
        console.log(o.orderNumber, led);
    }

    const pp3148 = await prisma.financialLedgerEntry.findMany({
        where: {
            sourceKey: { startsWith: 'PAYPAL_TX:' },
            totalCents: 3148,
            accountingDate: { gte: new Date('2026-08-16'), lt: new Date('2026-08-18') },
        },
        select: {
            sourceKey: true,
            totalCents: true,
            reversedAt: true,
            accountingDate: true,
            metadataJson: true,
            orderId: true,
            description: true,
        },
    });
    console.log(
        'pp3148',
        pp3148.map((p) => ({
            k: p.sourceKey,
            rev: !!p.reversedAt,
            report: !!(p.metadataJson as any)?.paypalSalesReport,
            oid: p.orderId,
            desc: (p.description || '').slice(0, 80),
        }))
    );

    const st3148 = await prisma.financialLedgerEntry.findMany({
        where: {
            sourceKey: { startsWith: 'STRIPE_TX:' },
            totalCents: { in: [3148, -3148] },
            accountingDate: { gte: new Date('2026-08-16'), lt: new Date('2026-08-19') },
        },
        select: {
            sourceKey: true,
            totalCents: true,
            reversedAt: true,
            accountingDate: true,
            orderId: true,
            description: true,
        },
    });
    console.log(
        'st3148',
        st3148.map((s) => ({
            k: s.sourceKey,
            e: s.totalCents / 100,
            rev: !!s.reversedAt,
            d: s.accountingDate.toISOString().slice(0, 10),
            oid: s.orderId,
        }))
    );

    // manuals residual
    const manuals = await prisma.financialLedgerEntry.findMany({
        where: {
            fiscalYear: 2026,
            sourceKey: { startsWith: 'MANUAL_INBOUND:' },
            category: 'RICAVI_VENDITE',
        },
        select: {
            sourceKey: true,
            totalCents: true,
            reversedAt: true,
            accountingDate: true,
            orderId: true,
            description: true,
        },
    });
    const mOrders = await prisma.order.findMany({
        where: { id: { in: manuals.map((m) => m.orderId!).filter(Boolean) } },
        select: { id: true, orderNumber: true, buyerFullName: true, createdAt: true },
    });
    const mo = new Map(mOrders.map((o) => [o.id, o]));
    console.log(
        'manualsAll',
        manuals.map((m) => {
            const o = m.orderId ? mo.get(m.orderId) : null;
            return {
                order: o?.orderNumber,
                buyer: o?.buyerFullName,
                e: Math.abs(m.totalCents) / 100,
                d: m.accountingDate.toISOString().slice(0, 10),
                rev: !!m.reversedAt,
                created: o?.createdAt.toISOString().slice(0, 10),
                key: m.sourceKey,
            };
        })
    );

    // stripe_eu census
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
    const raw = stripeEu.reduce((a, s) => a + Math.abs(s.totalCents), 0) / 100;
    const withOid = stripeEu.filter((s) => s.orderId);
    const ords = await prisma.order.findMany({
        where: { id: { in: [...new Set(withOid.map((s) => s.orderId!))] } },
        select: { id: true, orderNumber: true, buyerFullName: true, buyerEmail: true },
    });
    const byId = new Map(ords.map((o) => [o.id, o]));
    const census = stripeEu.map((s) => {
        const o = s.orderId ? byId.get(s.orderId) : null;
        const meta = (s.metadataJson || {}) as any;
        return {
            k: s.sourceKey,
            e: Math.abs(s.totalCents) / 100,
            d: s.accountingDate.toISOString().slice(0, 10),
            order: o?.orderNumber || null,
            buyer: o?.buyerFullName || null,
            email: o?.buyerEmail || null,
            desc: (s.description || '').slice(0, 120),
            pi: meta.paymentIntentId || meta.stripePaymentIntentId || null,
        };
    });
    const noOrder = census.filter((c) => !c.order);
    const withOrder = census.filter((c) => c.order);
    console.log(
        JSON.stringify(
            {
                stripeEuRaw: { n: stripeEu.length, euro: +raw.toFixed(2), expected: 1121.18, orphanEuro: +(raw - 1121.18).toFixed(2) },
                noOrder: { n: noOrder.length, euro: +noOrder.reduce((a, c) => a + c.e, 0).toFixed(2), rows: noOrder },
                withOrder: {
                    n: withOrder.length,
                    euro: +withOrder.reduce((a, c) => a + c.e, 0).toFixed(2),
                    rows: withOrder,
                },
            },
            null,
            2
        )
    );

    // TX_IN without report flag — raw scan
    const txIn = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, sourceKey: { startsWith: 'PAYPAL_TX:' }, totalCents: { gt: 0 } },
        select: { sourceKey: true, totalCents: true, accountingDate: true, metadataJson: true, description: true },
    });
    const notReport = txIn.filter((t) => !(t.metadataJson as any)?.paypalSalesReport);
    const isReport = txIn.filter((t) => (t.metadataJson as any)?.paypalSalesReport);
    console.log({
        txInN: txIn.length,
        txInEuro: txIn.reduce((a, t) => a + t.totalCents, 0) / 100,
        reportN: isReport.length,
        reportEuro: isReport.reduce((a, t) => a + t.totalCents, 0) / 100,
        notReportN: notReport.length,
        notReportEuro: notReport.reduce((a, t) => a + t.totalCents, 0) / 100,
        notReport: notReport.map((t) => ({
            k: t.sourceKey,
            e: t.totalCents / 100,
            d: t.accountingDate.toISOString().slice(0, 10),
            desc: (t.description || '').slice(0, 70),
            metaKeys: Object.keys((t.metadataJson as any) || {}),
        })),
    });

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
