/**
 * Sola lettura: tabella corrispettivi 34 ordini .eu mancanti.
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
function scorpora10(grossCents: number) {
    const abs = Math.abs(Math.round(grossCents));
    const imponibile = Math.round(abs / 1.1);
    return { imponibileCents: imponibile, ivaCents: abs - imponibile };
}
function qOf(date: string) {
    return Math.ceil(parseInt(date.slice(5, 7), 10) / 3);
}
function day(d: Date | null | undefined) {
    return d ? d.toISOString().slice(0, 10) : '';
}
function daysBetween(a: string, b: Date) {
    return Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(day(b) + 'T12:00:00Z')) / 86400000;
}

const MISSING = `
2026-08-17;Amanda Favot;109.98
2026-06-16;Rosetta Paladino;49.46
2026-06-05;cyrille magali Maman-Sernaglia;89.99
2026-05-25;Petra Manakova;84.98
2026-05-16;Maria Puliafico;49.99
2026-05-03;Maria ANTONIA Pozzi;53.48
2026-05-03;Isabella Cesaroni;299.90
2026-04-29;Rosetta Paladino;45.97
2026-04-28;Silvia Tregnaghi;54.98
2026-04-27;Famiglia Deotti-Buzzi;39.99
2026-04-20;LUCIANO MAMMI';59.98
2026-04-20;Elena Lombardi;39.99
2026-04-16;Rosaria Di Pasquale;29.99
2026-04-01;Cristiano Mariani;29.99
2026-03-31;FRANCESCO REDIVO;144.98
2026-03-29;Agostino Buttignol;29.99
2026-03-24;LUCIANO MAMMI';29.99
2026-03-22;LUCIANO MAMMI';29.99
2026-03-19;Silvia Tregnaghi;34.99
2026-03-18;L'alternativa srl;39.99
2026-03-14;Chiara Durì;72.48
2026-03-14;Rosetta Paladino;69.98
2026-03-13;Maria Puliafico;49.99
2026-03-01;Mimma Congedo;144.98
2026-02-26;Norm Marchi;39.99
2026-02-25;Moreno Venturino;29.99
2026-02-22;LUCIANO MAMMI';29.99
2026-02-19;Luigina Dereani;39.99
2026-02-16;LUCIANO MAMMI';29.99
2026-02-10;Ester Irace;39.99
2026-01-22;Luciano Mammì;29.99
2026-01-22;Rosetta Paladino;40.97
2026-01-21;Luciano Mammì;29.99
2026-01-16;Giulia Grappone;39.99
`
    .trim()
    .split('\n')
    .map((l) => {
        const [date, customer, amount] = l.split(';');
        return { date, customer, cents: Math.round(parseFloat(amount) * 100) };
    });

async function main() {
    const stripeEu = await prisma.stripeFinanceMovement.findMany({
        where: { stripeId: { startsWith: 'stripe_eu_' }, type: 'charge' },
        select: { amountCents: true, createdAtStripe: true },
    });
    const pp = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: { totalCents: true, accountingDate: true },
    });
    const usedPp = new Set<number>();
    const usedSt = new Set<number>();
    const rows: Array<Record<string, unknown>> = [];

    for (const o of MISSING) {
        const vat = scorpora10(o.cents);
        let payDate: string | null = null;
        let channel = '—';
        let si = -1;
        let bestDd = 99;
        stripeEu.forEach((m, i) => {
            if (usedSt.has(i)) return;
            if (Math.abs(m.amountCents - o.cents) > 1) return;
            const dd = daysBetween(o.date, m.createdAtStripe);
            if (dd <= 5 && dd < bestDd) {
                bestDd = dd;
                si = i;
            }
        });
        if (si >= 0) {
            usedSt.add(si);
            payDate = day(stripeEu[si].createdAtStripe);
            channel = 'Stripe EU';
        } else {
            let pi = -1;
            bestDd = 99;
            pp.forEach((p, i) => {
                if (usedPp.has(i)) return;
                if (Math.abs(p.totalCents - o.cents) > 1) return;
                const dd = daysBetween(o.date, p.accountingDate);
                if (dd <= 5 && dd < bestDd) {
                    bestDd = dd;
                    pi = i;
                }
            });
            if (pi >= 0) {
                usedPp.add(pi);
                payDate = day(pp[pi].accountingDate);
                channel = 'PayPal';
            }
        }
        // Isabella special: charge 284.90
        if (o.customer === 'Isabella Cesaroni' && channel === '—') {
            const hit = stripeEu.findIndex(
                (m, i) =>
                    !usedSt.has(i) &&
                    Math.abs(m.amountCents - 28490) < 1 &&
                    daysBetween(o.date, m.createdAtStripe) <= 1
            );
            if (hit >= 0) {
                usedSt.add(hit);
                payDate = day(stripeEu[hit].createdAtStripe);
                channel = 'Stripe EU (charge €284,90)';
            }
        }

        const orderQ = qOf(o.date);
        const payQ = payDate ? qOf(payDate) : null;
        const centsPart = o.cents % 100;
        const accessoryHint = [46, 47, 48, 97, 98].includes(centsPart);

        rows.push({
            date: o.date,
            customer: o.customer,
            lordoCents: o.cents,
            lordo: euro(o.cents),
            aliquota: '10%',
            imponibile: euro(vat.imponibileCents),
            iva: euro(vat.ivaCents),
            imponibileCents: vat.imponibileCents,
            ivaCents: vat.ivaCents,
            trim: `2026-T${orderQ}`,
            channel,
            payDate,
            payTrim: payQ ? `2026-T${payQ}` : null,
            accessoryHint,
            contestabile: payQ != null && payQ !== orderQ,
        });
    }

    const byQ: Record<string, { n: number; lordo: number; imponibile: number; iva: number }> = {};
    for (const r of rows) {
        const t = String(r.trim);
        if (!byQ[t]) byQ[t] = { n: 0, lordo: 0, imponibile: 0, iva: 0 };
        byQ[t].n++;
        byQ[t].lordo += Number(r.lordoCents);
        byQ[t].imponibile += Number(r.imponibileCents);
        byQ[t].iva += Number(r.ivaCents);
    }

    console.log(
        JSON.stringify(
            {
                rows,
                byQ: Object.fromEntries(
                    Object.entries(byQ).map(([k, v]) => [
                        k,
                        {
                            n: v.n,
                            lordo: euro(v.lordo),
                            imponibile: euro(v.imponibile),
                            iva: euro(v.iva),
                        },
                    ])
                ),
                accessoryHints: rows
                    .filter((r) => r.accessoryHint)
                    .map((r) => `${r.date};${r.customer};${r.lordo}`),
                contestabili: rows
                    .filter((r) => r.contestabile)
                    .map(
                        (r) =>
                            `${r.date};${r.customer};ord ${r.trim};incasso ${r.payDate} ${r.payTrim}`
                    ),
                totals: {
                    n: rows.length,
                    lordo: euro(rows.reduce((s, r) => s + Number(r.lordoCents), 0)),
                    iva: euro(rows.reduce((s, r) => s + Number(r.ivaCents), 0)),
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
