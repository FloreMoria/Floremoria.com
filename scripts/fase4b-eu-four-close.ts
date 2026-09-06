/**
 * Sola lettura: chiusura 4 ordini .eu + conteggio ricevute.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import prisma from '../lib/prisma';

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}
function day(d: Date) {
    return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: Date) {
    const bd = b.toISOString().slice(0, 10);
    return Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(bd + 'T12:00:00Z')) / 86400000;
}

const FOUR = [
    { date: '2026-05-03', customer: 'Isabella Cesaroni', cents: 29990 },
    { date: '2026-08-17', customer: 'Amanda Favot', cents: 10998 },
    { date: '2026-07-03', customer: '(senza nome)', cents: 6999 },
    { date: '2026-01-20', customer: '(senza nome)', cents: 3999 },
];

async function main() {
    const receiptCount = await prisma.customerOrderReceipt.count();
    const ordersWithReceipt = await prisma.order.count({
        where: { deletedAt: null, customerReceipts: { some: {} } },
    });
    const ordersActive = await prisma.order.count({ where: { deletedAt: null } });
    const sample = await prisma.customerOrderReceipt.findMany({
        take: 3,
        select: {
            orderNumber: true,
            grossCents: true,
            floralImponibileCents: true,
            accessoryImponibileCents: true,
            ivaDebitoCents: true,
            issuedAt: true,
        },
    });
    console.log(
        JSON.stringify({ receiptCount, ordersWithReceipt, ordersActive, sample }, null, 2)
    );

    const stripeEu = await prisma.stripeFinanceMovement.findMany({
        where: { stripeId: { startsWith: 'stripe_eu_' } },
        select: {
            stripeId: true,
            type: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            createdAtStripe: true,
            description: true,
            metadataJson: true,
            sourceId: true,
            payoutId: true,
        },
    });

    const pp = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: {
            totalCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
            category: true,
        },
    });

    for (const t of FOUR) {
        console.log('\n====', t.customer, t.date, euro(t.cents));
        const nearStripe = stripeEu
            .filter((m) => {
                const dd = daysBetween(t.date, m.createdAtStripe);
                return (
                    dd <= 7 &&
                    (Math.abs(Math.abs(m.amountCents) - t.cents) <= 2000 ||
                        Math.abs(m.amountCents) === t.cents)
                );
            })
            .map((m) => ({
                type: m.type,
                date: day(m.createdAtStripe),
                amt: euro(m.amountCents),
                fee: euro(m.feeCents),
                net: euro(m.netCents),
                desc: (m.description || '').slice(0, 80),
                id: m.stripeId,
            }));
        console.log('stripe', JSON.stringify(nearStripe, null, 2));

        const nearPp = pp
            .filter(
                (p) =>
                    daysBetween(t.date, p.accountingDate) <= 7 &&
                    Math.abs(Math.abs(p.totalCents) - t.cents) <= 2000
            )
            .map((p) => ({
                d: day(p.accountingDate),
                amt: euro(p.totalCents),
                cp: p.counterpartyName,
                desc: (p.description || '').slice(0, 80),
            }));
        console.log('paypal', JSON.stringify(nearPp, null, 2));

        const start = new Date(Date.parse(t.date + 'T00:00:00Z') - 7 * 86400000);
        const end = new Date(Date.parse(t.date + 'T00:00:00Z') + 21 * 86400000);
        const lines = await prisma.bankStatementLine.findMany({
            where: {
                amountCents: { gt: 0 },
                accountingDate: { gte: start, lte: end },
            },
            select: {
                amountCents: true,
                accountingDate: true,
                description: true,
                matchType: true,
            },
        });
        const nearLines = lines.filter(
            (l) =>
                Math.abs(l.amountCents - t.cents) <= 1 ||
                Math.abs(l.amountCents - t.cents) <= 2000 ||
                (/STRIPE|PAYPAL|WIX|ADYEN/i.test(l.description) &&
                    Math.abs(l.amountCents - t.cents) < 5000)
        );
        console.log(
            'bankLines',
            JSON.stringify(
                nearLines.map((l) => ({
                    d: day(l.accountingDate),
                    amt: euro(l.amountCents),
                    mt: l.matchType,
                    desc: l.description.slice(0, 110),
                })),
                null,
                2
            )
        );
    }

    // Exact ledger amounts
    for (const cents of [29990, 28490, 10998, 6999, 3999, 3999]) {
        const rows = await prisma.financialLedgerEntry.findMany({
            where: {
                reversedAt: null,
                OR: [{ totalCents: cents }, { totalCents: -cents }],
            },
            select: {
                sourceType: true,
                totalCents: true,
                accountingDate: true,
                description: true,
                category: true,
                counterpartyName: true,
            },
            take: 30,
        });
        console.log(
            '\nledger',
            euro(cents),
            rows.map((r) => ({
                st: r.sourceType,
                d: day(r.accountingDate),
                amt: euro(r.totalCents),
                cat: r.category,
                cp: r.counterpartyName,
                desc: (r.description || '').slice(0, 70),
            }))
        );
    }

    // Amanda: same day com order 39.99 + stripe subscription 39.99 — search 70 / 109.98 parts
    const amandaStripe = stripeEu.filter((m) => day(m.createdAtStripe) === '2026-08-17');
    console.log('\nAmanda day stripe all', amandaStripe.map((m) => ({ type: m.type, amt: euro(m.amountCents), desc: m.description })));

    // July 3 charges
    const jul3 = stripeEu.filter((m) => {
        const d = day(m.createdAtStripe);
        return d >= '2026-06-30' && d <= '2026-07-08' && m.type === 'charge';
    });
    console.log('\ncharges around Jul3', jul3.map((m) => ({ d: day(m.createdAtStripe), amt: euro(m.amountCents), desc: m.description })));

    // Jan 16-22 charges and paypal
    const jan = stripeEu.filter((m) => {
        const d = day(m.createdAtStripe);
        return d >= '2026-01-15' && d <= '2026-01-25' && (m.type === 'charge' || m.type === 'payment');
    });
    console.log('\njan stripe', jan.map((m) => ({ d: day(m.createdAtStripe), type: m.type, amt: euro(m.amountCents), desc: m.description })));
    const janPp = pp.filter((p) => {
        const d = day(p.accountingDate);
        return d >= '2026-01-15' && d <= '2026-01-25';
    });
    console.log('\njan paypal', janPp.map((p) => ({ d: day(p.accountingDate), amt: euro(p.totalCents), cp: p.counterpartyName, desc: (p.description || '').slice(0, 60) })));
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
