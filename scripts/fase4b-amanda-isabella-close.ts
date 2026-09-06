/**
 * Sola lettura: Amanda Aug 15-25 + Isabella delta €15.
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

async function main() {
    const from = new Date('2026-08-15T00:00:00.000Z');
    const to = new Date('2026-08-25T23:59:59.999Z');
    const exact = 10998;
    const lo = 10500;
    const hi = 11000;

    const bank = await prisma.bankStatementLine.findMany({
        where: { accountingDate: { gte: from, lte: to }, amountCents: { gt: 0 } },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            description: true,
            matchType: true,
        },
        orderBy: { accountingDate: 'asc' },
    });
    const bankHit = bank.filter(
        (b) =>
            Math.abs(b.amountCents - exact) <= 1 ||
            (b.amountCents >= lo && b.amountCents <= hi)
    );
    const bankGateway = bank.filter((b) =>
        /STRIPE|PAYPAL|WIX|ADYEN|FAVOT|AMANDA|BONIFICO/i.test(b.description)
    );

    const led = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            accountingDate: { gte: from, lte: to },
            OR: [
                { totalCents: { gte: lo, lte: hi } },
                { totalCents: exact },
                { totalCents: -exact },
            ],
        },
        select: {
            sourceType: true,
            category: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
        },
    });

    const stripe = await prisma.stripeFinanceMovement.findMany({
        where: { createdAtStripe: { gte: from, lte: to } },
        select: {
            stripeId: true,
            type: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            createdAtStripe: true,
            description: true,
        },
    });
    const stripeHit = stripe.filter(
        (s) =>
            Math.abs(Math.abs(s.amountCents) - exact) <= 1 ||
            (Math.abs(s.amountCents) >= lo && Math.abs(s.amountCents) <= hi) ||
            (Math.abs(s.netCents) >= lo && Math.abs(s.netCents) <= hi)
    );

    // broaden stripe COM+EU all types with favot in meta - scan descriptions
    const stripeWider = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: from, lte: to },
            OR: [
                { amountCents: exact },
                { amountCents: { gte: lo, lte: hi } },
                { netCents: { gte: lo, lte: hi } },
            ],
        },
        select: {
            stripeId: true,
            type: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            createdAtStripe: true,
            description: true,
        },
    });

    const pp = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: { gte: from, lte: to },
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: {
            totalCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
        },
    });
    const ppHit = pp.filter(
        (p) =>
            Math.abs(p.totalCents - exact) <= 1 ||
            (p.totalCents >= lo && p.totalCents <= hi) ||
            /FAVOT|AMANDA/i.test(`${p.counterpartyName || ''}${p.description || ''}`)
    );

    const wix = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { description: { contains: 'Wix', mode: 'insensitive' } },
                { description: { contains: 'Adyen', mode: 'insensitive' } },
            ],
        },
        select: {
            totalCents: true,
            accountingDate: true,
            description: true,
            category: true,
            sourceType: true,
        },
    });

    // Also search entire August for 109.98
    const bankAug = await prisma.bankStatementLine.findMany({
        where: {
            accountingDate: {
                gte: new Date('2026-08-01'),
                lte: new Date('2026-08-31'),
            },
            amountCents: { in: [exact, ...Array.from({ length: 6 }, (_, i) => lo + i * 100)] },
        },
        select: { amountCents: true, accountingDate: true, description: true },
    });
    // exact anywhere
    const bankExactAnywhere = await prisma.bankStatementLine.findMany({
        where: { amountCents: exact },
        select: { amountCents: true, accountingDate: true, description: true },
    });
    const stripeExactAnywhere = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [{ amountCents: exact }, { amountCents: -exact }, { netCents: exact }],
        },
        select: {
            stripeId: true,
            type: true,
            amountCents: true,
            netCents: true,
            createdAtStripe: true,
            description: true,
        },
    });
    const ppExactAnywhere = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            totalCents: exact,
        },
        select: {
            accountingDate: true,
            totalCents: true,
            counterpartyName: true,
            description: true,
        },
    });

    const amandaFound =
        bankHit.length +
            stripeHit.length +
            stripeWider.length +
            ppHit.length +
            bankExactAnywhere.length +
            stripeExactAnywhere.length +
            ppExactAnywhere.filter((p) => /FAVOT|AMANDA/i.test(`${p.counterpartyName}${p.description}`))
                .length >
        0;

    console.log(
        JSON.stringify(
            {
                amanda: {
                    window: '2026-08-15..25',
                    bankHit: bankHit.map((b) => ({
                        d: day(b.accountingDate),
                        amt: euro(b.amountCents),
                        mt: b.matchType,
                        desc: b.description.slice(0, 120),
                    })),
                    bankGatewayInWindow: bankGateway.map((b) => ({
                        d: day(b.accountingDate),
                        amt: euro(b.amountCents),
                        desc: b.description.slice(0, 100),
                    })),
                    ledgerHit: led.map((r) => ({
                        st: r.sourceType,
                        d: day(r.accountingDate),
                        amt: euro(r.totalCents),
                        cat: r.category,
                        desc: (r.description || '').slice(0, 80),
                    })),
                    stripeHit: stripeHit.map((s) => ({
                        d: day(s.createdAtStripe),
                        type: s.type,
                        amt: euro(s.amountCents),
                        fee: euro(s.feeCents),
                        net: euro(s.netCents),
                        id: s.stripeId,
                    })),
                    stripeWider: stripeWider.map((s) => ({
                        d: day(s.createdAtStripe),
                        type: s.type,
                        amt: euro(s.amountCents),
                        net: euro(s.netCents),
                    })),
                    paypalHit: ppHit.map((p) => ({
                        d: day(p.accountingDate),
                        amt: euro(p.totalCents),
                        cp: p.counterpartyName,
                    })),
                    wixAdyenAllTime: wix.map((w) => ({
                        d: day(w.accountingDate),
                        amt: euro(w.totalCents),
                        cat: w.category,
                        desc: w.description.slice(0, 90),
                    })),
                    bankExactAnywhere: bankExactAnywhere.map((b) => ({
                        d: day(b.accountingDate),
                        amt: euro(b.amountCents),
                        desc: b.description.slice(0, 80),
                    })),
                    stripeExactAnywhere: stripeExactAnywhere.map((s) => ({
                        d: day(s.createdAtStripe),
                        type: s.type,
                        amt: euro(s.amountCents),
                    })),
                    ppExactAnywhere: ppExactAnywhere.map((p) => ({
                        d: day(p.accountingDate),
                        amt: euro(p.totalCents),
                        cp: p.counterpartyName,
                    })),
                    bankAugNear: bankAug.map((b) => ({
                        d: day(b.accountingDate),
                        amt: euro(b.amountCents),
                    })),
                    verdict: amandaFound ? 'FOUND_CANDIDATE' : 'NOT_FOUND_LEAVE_OPEN',
                },
            },
            null,
            2
        )
    );

    const isabella = await prisma.stripeFinanceMovement.findMany({
        where: {
            stripeId: { startsWith: 'stripe_eu_' },
            createdAtStripe: {
                gte: new Date('2026-05-01'),
                lte: new Date('2026-05-10'),
            },
        },
        select: {
            stripeId: true,
            type: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            createdAtStripe: true,
            description: true,
            metadataJson: true,
        },
        orderBy: { createdAtStripe: 'asc' },
    });
    const charge = isabella.find((m) => m.type === 'charge' && Math.abs(m.amountCents - 28490) < 1);
    const fee = charge?.feeCents ?? 0;
    const refunds = isabella.filter(
        (m) => m.type === 'refund' || (m.type !== 'payout' && m.amountCents < 0)
    );
    const fifteen = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: {
                gte: new Date('2026-05-01'),
                lte: new Date('2026-05-31'),
            },
            OR: [
                { amountCents: 1500 },
                { amountCents: -1500 },
                { feeCents: 1500 },
            ],
        },
        select: {
            type: true,
            amountCents: true,
            feeCents: true,
            createdAtStripe: true,
            stripeId: true,
        },
    });

    // Is 284.90 = 299.90 / 1.something? or 299.90 - 15 tip?
    const delta = 29990 - 28490;
    console.log(
        JSON.stringify(
            {
                isabella: {
                    listino: euro(29990),
                    charge: charge
                        ? {
                              amt: euro(charge.amountCents),
                              fee: euro(fee),
                              net: euro(charge.netCents),
                              meta: charge.metadataJson,
                              id: charge.stripeId,
                          }
                        : null,
                    deltaListinoMinusCharge: euro(delta),
                    feeEqualsDelta: fee === delta,
                    feeCents: fee,
                    window: isabella.map((m) => ({
                        d: day(m.createdAtStripe),
                        type: m.type,
                        amt: euro(m.amountCents),
                        fee: euro(m.feeCents),
                        desc: m.description,
                    })),
                    fifteenMovementsMay: fifteen,
                    refundsInWindow: refunds.map((r) => ({
                        type: r.type,
                        amt: euro(r.amountCents),
                    })),
                    classification: {
                        commissione: fee === 1500 ? 'YES' : `NO (fee=${fee} cent ≠ 1500)`,
                        rimborsoParziale: refunds.length > 0 ? 'POSSIBILE' : 'NO evidence in Stripe EU window',
                        scontoONonAddebitato:
                            fee !== 1500 && refunds.length === 0
                                ? 'YES — delta €15 non è fee Stripe; nessun refund €15 in finestra'
                                : 'see above',
                    },
                },
            },
            null,
            2
        )
    );
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
