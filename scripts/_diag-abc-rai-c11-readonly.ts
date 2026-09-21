/**
 * Sola lettura: gruppi A/B/C sui 14 mismatch + PnL + C11 payment↔order.
 */
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import { namesCompatible } from '@/lib/financial/partnerNameMatch';

type Mismatch = {
    date: string;
    amountEuro: string;
    amountCents: number;
    beneficiary: string | null;
    partnerAttributed: string | null;
    bankLineId: string;
    descriptionSnippet: string;
};

function euro(cents: number) {
    return (cents / 100).toFixed(2);
}

function dayMs(iso: string) {
    return Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
}

async function main() {
    const auditPath = path.join(process.cwd(), 'docs/verbali/2026-09-20-audit-bonifico-fiorista.json');
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8')) as { mismatches: Mismatch[] };

    const groupA: Mismatch[] = [];
    const groupB: Mismatch[] = [];
    const groupC: Mismatch[] = [];

    for (const m of audit.mismatches) {
        const desc = `${m.beneficiary || ''} ${m.descriptionSnippet || ''}`.toUpperCase();
        const isPaypal = /PAYPAL/.test(desc);
        const isDc = /DC\s+STUDIO|DC STUDIO/.test(desc);
        if (isDc || isPaypal) {
            groupA.push(m);
            continue;
        }
        if (m.beneficiary && /FERRANTE/i.test(m.beneficiary) && m.partnerAttributed === 'MAG Flowers') {
            groupC.push(m);
            continue;
        }
        groupB.push(m);
    }

    const sum = (rows: Mismatch[]) => rows.reduce((s, r) => s + r.amountCents, 0);

    console.log(
        '---GROUPS---',
        JSON.stringify(
            {
                A: {
                    n: groupA.length,
                    euro: euro(sum(groupA)),
                    rows: groupA.map((r) => ({
                        date: r.date,
                        euro: r.amountEuro,
                        beneficiary: r.beneficiary,
                        was: r.partnerAttributed,
                    })),
                },
                B: {
                    n: groupB.length,
                    euro: euro(sum(groupB)),
                    rows: groupB.map((r) => ({
                        date: r.date,
                        euro: r.amountEuro,
                        beneficiary: r.beneficiary,
                        was: r.partnerAttributed,
                    })),
                },
                C: {
                    n: groupC.length,
                    euro: euro(sum(groupC)),
                    rows: groupC.map((r) => ({
                        date: r.date,
                        euro: r.amountEuro,
                        beneficiary: r.beneficiary,
                        was: r.partnerAttributed,
                    })),
                },
                smoke: {
                    studioFalse: namesCompatible('DC Studio Stp Srl', 'Margherita Flower Studio'),
                    fioriFalse: namesCompatible('Acquisto Fiori per Cimitero', 'Mastro Fiori'),
                    aldoFalse: namesCompatible(
                        'PayPal (Europe) Causale: Saldo PayPal',
                        'Floragarden di Stinga Baldassarre Aldo'
                    ),
                    ferranteTrue: namesCompatible(
                        'Flowers di Ferrante Ignazio',
                        'MAG Flowers di Ferrante Ignazio'
                    ),
                },
            },
            null,
            2
        )
    );

    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const byCat = await prisma.financialLedgerEntry.groupBy({
        by: ['category'],
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            OR: [{ direction: 'USCITA' }, { totalCents: { lt: 0 } }],
        },
        _sum: { totalCents: true },
        _count: true,
    });

    const tracked = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { contains: 'cmt311c5f000sl4041s82u7pg' } },
                { sourceKey: { contains: 'cmt2q4dvb0019jl04xfxs7wfj' } },
                { sourceKey: { contains: 'cmtq83vdw0001ld04ixwfktv0' } },
            ],
        },
        select: { sourceKey: true, category: true, totalCents: true },
    });

    const bankPaypal = await prisma.bankStatementLine.findUnique({
        where: { id: 'cmtq83vdw0001ld04ixwfktv0' },
        select: { matchType: true, matchNotes: true, matchedOrderId: true },
    });

    console.log(
        '---PNL---',
        JSON.stringify(
            {
                raiEuro: euro(pnl.risultatoAnteImposteCents),
                ricaviEuro: euro(pnl.ricaviLordiCents),
                costiFioristiEuro: euro(pnl.costiFioristiCents),
                costiProduzioneEuro: euro(pnl.costiProduzioneCents),
                costiSaasEuro: euro(pnl.costiSaasCents),
                costiOperativiEuro: euro(pnl.costiOperativiCents),
                oneriBancariEuro: euro(pnl.oneriBancariCents),
                categoriesOut: Object.fromEntries(
                    byCat.map((c) => [
                        c.category,
                        { n: c._count, euro: euro(Math.abs(c._sum.totalCents || 0)) },
                    ])
                ),
                tracked,
                bankPaypal500: bankPaypal,
            },
            null,
            2
        )
    );

    const gwRows: Array<{
        tx: string;
        date: string;
        channel: string;
        grossCents: number;
        orderId: string | null;
    }> = [];
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(2026, q);
        if (b.start > new Date()) continue;
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            gwRows.push({
                tx: r.transactionId,
                date: r.date,
                channel: r.canaleIncasso,
                grossCents: Math.abs(r.grossCents),
                orderId: r.orderId,
            });
        }
    }

    const paymentsWithoutOrder = gwRows.filter((r) => !r.orderId);
    const linkedOrderIds = new Set(gwRows.filter((r) => r.orderId).map((r) => r.orderId!));

    const orders = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            createdAt: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
            status: { notIn: ['CANCELLED', 'PENDING'] },
            totalPriceCents: { gt: 0 },
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            createdAt: true,
            stripeTransactionId: true,
            isRecurring: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            paymentMethodLabel: true,
            additionalInstructions: true,
            financeNotes: true,
        },
    });
    const salesOrders = orders.filter((o) => !isPrepaidSubscriptionPoseOrder(o));
    const ordersWithoutPayment = salesOrders.filter((o) => !linkedOrderIds.has(o.id));

    const proposals: Array<{
        paymentTx: string;
        paymentDate: string;
        paymentEuro: string;
        orderNumber: string | null;
        orderDate: string;
        dayDelta: number;
    }> = [];
    for (const p of paymentsWithoutOrder) {
        for (const o of ordersWithoutPayment) {
            if (o.totalPriceCents !== p.grossCents) continue;
            const od = o.createdAt.toISOString().slice(0, 10);
            const delta = Math.round((dayMs(p.date) - dayMs(od)) / 86400000);
            if (Math.abs(delta) <= 7) {
                proposals.push({
                    paymentTx: p.tx,
                    paymentDate: p.date,
                    paymentEuro: euro(p.grossCents),
                    orderNumber: o.orderNumber,
                    orderDate: od,
                    dayDelta: delta,
                });
            }
        }
    }

    // Snapshot algebra €21.48 (lista 4398.64 vs gw 4377.16)
    const listaSnap = 439864;
    const gwSum = gwRows.reduce((s, r) => s + r.grossCents, 0);
    console.log(
        '---C11_AND_DELTA---',
        JSON.stringify(
            {
                paymentsWithoutOrder: {
                    n: paymentsWithoutOrder.length,
                    euro: euro(paymentsWithoutOrder.reduce((s, r) => s + r.grossCents, 0)),
                },
                ordersWithoutPayment: {
                    n: ordersWithoutPayment.length,
                    euro: euro(ordersWithoutPayment.reduce((s, o) => s + o.totalPriceCents, 0)),
                    sample: ordersWithoutPayment.slice(0, 8).map((o) => ({
                        n: o.orderNumber,
                        euro: euro(o.totalPriceCents),
                        date: o.createdAt.toISOString().slice(0, 10),
                    })),
                },
                plausiblePairsSameAmountWithin7d: proposals.length,
                gwTotal: { n: gwRows.length, euro: euro(gwSum) },
                delta2148: {
                    listaSnapEuro: euro(listaSnap),
                    gwEuro: euro(gwSum),
                    deltaEuro: euro(listaSnap - gwSum),
                    explanation:
                        'Netto di (ordini in lista senza match gateway) − (incassi gateway senza ordine in lista). Non arrotondamento né singolo parziale.',
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
