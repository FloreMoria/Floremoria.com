/**
 * Modello vendite 2026: report PayPal HAYUM + Stripe.
 * Cross: 32 pagamenti PayPal vs STRIPE_TX e MANUAL_INBOUND.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import prisma from '@/lib/prisma';

const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-paypal-sales-model.json');
const REPORT_YTD =
    '/Users/floremoria/Downloads/sales-report-HAYUMYJTWLRTE-2026-01-01-2026-09-10.csv';
const TX_CSV = '/Users/floremoria/Downloads/Transazioni PayPal FloreMoria 2026.CSV';

function parseEuro(s: string): number {
    const t = (s || '').trim();
    if (!t) return 0;
    if (t.includes(',') && t.includes('.')) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
    if (t.includes(',')) return parseFloat(t.replace(',', '.'));
    return parseFloat(t);
}

function parseSalesDaily(file: string) {
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const delim = text.includes(';') ? ';' : ',';
    const daily: { date: string; qty: number; volume: number }[] = [];
    let inDaily = false;
    for (const line of text.split(/\r?\n/)) {
        const parts = line.split(delim).map((p) => p.trim());
        if (parts[0] === 'Data' && (parts[1] || '').includes('Quantità')) {
            inDaily = true;
            continue;
        }
        if (!inDaily) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[0] || '')) {
            if ((parts[0] || '').startsWith('Totale') || (parts[0] || '').startsWith('Vendite')) {
                inDaily = false;
            }
            continue;
        }
        const qty = Math.round(parseFloat(parts[1] || '0') || 0);
        const volume = parseFloat((parts[2] || '0').replace(',', '.')) || 0;
        if (qty > 0) daily.push({ date: parts[0]!, qty, volume });
    }
    return daily;
}

async function main() {
    const daily = parseSalesDaily(REPORT_YTD);

    const raw = fs.readFileSync(TX_CSV, 'utf8');
    const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
    const paypalSales: {
        date: string;
        cents: number;
        feeCents: number;
        name: string;
        type: string;
        txId: string;
        payLater: boolean;
    }[] = [];
    for (const row of parsed.data) {
        const tipo = row['Tipo'] || '';
        const lordo = Math.round(parseEuro(row['Lordo'] || '') * 100);
        const fee = Math.round(Math.abs(parseEuro(row['Tariffa'] || '')) * 100);
        const impatto = row['Impatto sul saldo'] || '';
        if (lordo <= 0 || impatto !== 'Accredito') continue;
        const isSale =
            /Pagamento Express Checkout|Pagamento da cellulare|Pagamento generico|Pay Later|Pagamento abbonamento/i.test(
                tipo
            ) ||
            (/Pagamento/i.test(tipo) && !/preautorizzato|utenza|carta di debito/i.test(tipo));
        if (!isSale) continue;
        const dm = (row['Data'] || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!dm) continue;
        const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
        if (date > '2026-09-10') continue;
        const blob = `${tipo} ${row['Oggetto'] || ''} ${row['Messaggio'] || ''} ${row['Titolo oggetto'] || ''}`;
        paypalSales.push({
            date,
            cents: lordo,
            feeCents: fee,
            name: row['Nome'] || '',
            type: tipo,
            txId: row['Codice transazione'] || '',
            payLater: /pay\s*later/i.test(blob),
        });
    }

    const reportBuckets = new Map<string, { qty: number; volumeCents: number; used: number }>();
    for (const d of daily) {
        reportBuckets.set(d.date, { qty: d.qty, volumeCents: Math.round(d.volume * 100), used: 0 });
    }

    const matchedPaypal: typeof paypalSales = [];
    const unusedPaypal: typeof paypalSales = [];
    for (const s of [...paypalSales].sort(
        (a, b) => a.date.localeCompare(b.date) || a.cents - b.cents
    )) {
        const b = reportBuckets.get(s.date);
        if (b && b.used < b.qty) {
            b.used++;
            matchedPaypal.push(s);
        } else {
            unusedPaypal.push(s);
        }
    }

    const synthesized: { date: string; cents: number }[] = [];
    for (const [date, b] of reportBuckets) {
        const need = b.qty - b.used;
        if (need <= 0) continue;
        const usedCents = matchedPaypal.filter((m) => m.date === date).reduce((s, m) => s + m.cents, 0);
        const remain = b.volumeCents - usedCents;
        if (need === 1) {
            synthesized.push({ date, cents: remain });
            b.used++;
        } else {
            const unit = Math.round(remain / need);
            for (let i = 0; i < need; i++) {
                const c = i === need - 1 ? remain - unit * (need - 1) : unit;
                synthesized.push({ date, cents: c });
                b.used++;
            }
        }
    }

    const allPaypalPayments = [
        ...matchedPaypal.map((m) => ({ ...m, synthetic: false as const })),
        ...synthesized.map((s) => ({
            date: s.date,
            cents: s.cents,
            feeCents: 0,
            name: '',
            type: 'SYNTHETIC_FROM_REPORT',
            txId: '',
            payLater: s.date === '2026-05-03' && s.cents === 5348,
            synthetic: true as const,
        })),
    ];

    const paypalSum = allPaypalPayments.reduce((s, p) => s + p.cents, 0);

    const stripeTxs = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceKey: { startsWith: 'STRIPE_TX:' } },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            orderId: true,
        },
    });
    const stripeUsed = new Set<string>();
    const doubles: Array<Record<string, unknown>> = [];
    for (const p of allPaypalPayments) {
        const hit = stripeTxs.find((s) => {
            if (stripeUsed.has(s.id)) return false;
            if (Math.abs(Math.abs(s.totalCents) - p.cents) > 1) return false;
            const sd = s.accountingDate.toISOString().slice(0, 10);
            const dd =
                Math.abs(
                    new Date(sd + 'T12:00:00Z').getTime() - new Date(p.date + 'T12:00:00Z').getTime()
                ) / 86400000;
            return dd <= 1;
        });
        if (hit) {
            stripeUsed.add(hit.id);
            doubles.push({
                paypalDate: p.date,
                paypalEuro: p.cents / 100,
                paypalName: p.name,
                paypalTx: p.txId,
                paypalType: p.type,
                payLater: p.payLater,
                stripeDate: hit.accountingDate.toISOString().slice(0, 10),
                stripeEuro: Math.abs(hit.totalCents) / 100,
                stripeKey: hit.sourceKey,
                stripeId: hit.id,
                orderId: hit.orderId,
            });
        }
    }

    const doublesEuro = doubles.reduce(
        (s, d) => s + Math.round(Number(d.stripeEuro) * 100),
        0
    );
    const stripeTotal = stripeTxs.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const stripeAfter = stripeTotal - doublesEuro;

    const manuals = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'MANUAL_INBOUND:' },
            category: 'RICAVI_VENDITE',
        },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            accountingDate: true,
            orderId: true,
            description: true,
            metadataJson: true,
        },
    });
    const orders = await prisma.order.findMany({
        where: { deletedAt: null },
        select: { id: true, orderNumber: true, paymentMethodLabel: true, buyerFullName: true },
    });
    const onById = new Map(orders.map((o) => [o.id, o]));

    const manualUsed = new Set<string>();
    const manualsAsPaypal: Array<Record<string, unknown>> = [];
    for (const p of allPaypalPayments) {
        const hit = manuals.find((m) => {
            if (manualUsed.has(m.id)) return false;
            if (Math.abs(Math.abs(m.totalCents) - p.cents) > 1) return false;
            const md = m.accountingDate.toISOString().slice(0, 10);
            const dd =
                Math.abs(
                    new Date(md + 'T12:00:00Z').getTime() - new Date(p.date + 'T12:00:00Z').getTime()
                ) / 86400000;
            return dd <= 3;
        });
        if (hit) {
            manualUsed.add(hit.id);
            const o = hit.orderId ? onById.get(hit.orderId) : null;
            manualsAsPaypal.push({
                orderNumber: o?.orderNumber,
                buyer: o?.buyerFullName || p.name,
                euro: Math.abs(hit.totalCents) / 100,
                manualDate: hit.accountingDate.toISOString().slice(0, 10),
                paypalDate: p.date,
                paypalTx: p.txId,
                manualId: hit.id,
                manualKey: hit.sourceKey,
            });
        }
    }
    const manualsResidual = manuals
        .filter((m) => !manualUsed.has(m.id))
        .map((m) => {
            const o = m.orderId ? onById.get(m.orderId) : null;
            return {
                orderNumber: o?.orderNumber,
                buyer: o?.buyerFullName,
                euro: Math.abs(m.totalCents) / 100,
                date: m.accountingDate.toISOString().slice(0, 10),
                key: m.sourceKey,
                id: m.id,
            };
        });

    const stripeEu = stripeTxs.filter(
        (s) => /stripe_eu/i.test(s.sourceKey) || /stripe_eu/i.test(s.description || '')
    );
    const stripeEuNotDouble = stripeEu.filter((s) => !stripeUsed.has(s.id));
    const stripeEuEuro = stripeEuNotDouble.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // Pay Later: report day 03/05 €53.48 — find in TX CSV by date/amount even if type differs
    const may3 = await (async () => {
        const rows: Array<Record<string, string>> = [];
        for (const row of parsed.data) {
            if ((row['Data'] || '').startsWith('03/05/2026') || (row['Data'] || '').startsWith('5/3/2026')) {
                rows.push(row);
            }
        }
        return rows.map((r) => ({
            tipo: r['Tipo'],
            lordo: r['Lordo'],
            nome: r['Nome'],
            tx: r['Codice transazione'],
            oggetto: r['Oggetto'],
            impatto: r['Impatto sul saldo'],
        }));
    })();

    const feeSum = matchedPaypal.reduce((s, p) => s + p.feeCents, 0);
    const payouts = await prisma.financialLedgerEntry.aggregate({
        where: { reversedAt: null, sourceKey: { startsWith: 'PAYPAL_PAYOUT:' } },
        _sum: { totalCents: true },
        _count: true,
    });

    // Spese PayPal account (non sales)
    const spese = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [{ sourceKey: { startsWith: 'PAYPAL_' } }, { sourceType: 'PAYPAL_MOVEMENT' }],
            category: {
                in: ['SPESE_SAAS', 'SPESE_OPERATIVE', 'ALTRI_COSTI', 'CONSULENZE', 'COSTI_FIORISTI'],
            },
        },
        select: { totalCents: true },
    });
    const speseEuro = spese.reduce((s, r) => s + r.totalCents, 0);

    const report = {
        generatedAt: new Date().toISOString(),
        model: {
            paypalSalesEuro: paypalSum / 100,
            stripeTargetEuro: 2746.7,
            officialEuro: 4098.68,
        },
        paypalPayments: {
            n: allPaypalPayments.length,
            euro: paypalSum / 100,
            fromTxCsv: matchedPaypal.length,
            synthesized: synthesized.length,
            rows: allPaypalPayments,
        },
        punto1_stripeExcess: {
            stripeTxEuro: stripeTotal / 100,
            targetEuro: 2746.7,
            excessEuro: (stripeTotal - 274670) / 100,
            doublesN: doubles.length,
            doublesEuro: doublesEuro / 100,
            stripeAfterRemovingDoublesEuro: stripeAfter / 100,
            deltaVsTargetEuro: (stripeAfter - 274670) / 100,
            doubles,
        },
        punto2_fuoriGateway: {
            manualBeforeEuro: manuals.reduce((s, m) => s + Math.abs(m.totalCents), 0) / 100,
            manualsAsPaypalN: manualsAsPaypal.length,
            manualsAsPaypalEuro:
                manualsAsPaypal.reduce((s, m) => s + Math.round(Number(m.euro) * 100), 0) / 100,
            residualN: manualsResidual.length,
            residualEuro:
                manualsResidual.reduce((s, m) => s + Math.round(m.euro * 100), 0) / 100,
            manualsAsPaypal,
            residual: manualsResidual,
            stripeEuNotDoubleEuro: stripeEuEuro / 100,
            stripeEuNotDoubleN: stripeEuNotDouble.length,
            expectedStripeEuEuro: 1121.18,
        },
        punto3_paypalReconcile: {
            incassiEuro: paypalSum / 100,
            commissioniFromSalesCsvEuro: feeSum / 100,
            speseLedgerEuro: speseEuro / 100,
            prelieviLedgerEuro: Math.abs(payouts._sum.totalCents || 0) / 100,
            prelieviFinecoRefEuro: 569.88,
            equationDraftEuro:
                (paypalSum + feeSum * -1 + speseEuro - 56988) / 100,
        },
        payLaterMay3Rows: may3,
        unusedPaypalTxNotInReport: unusedPaypal,
    };

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(
        JSON.stringify(
            {
                paypalN: allPaypalPayments.length,
                paypalEuro: paypalSum / 100,
                doublesN: doubles.length,
                doublesEuro: doublesEuro / 100,
                stripeAfter: stripeAfter / 100,
                deltaVs2746: (stripeAfter - 274670) / 100,
                manualsAsPaypalN: manualsAsPaypal.length,
                manualsAsPaypalEuro: manualsAsPaypal.reduce((s, m) => s + Number(m.euro), 0),
                residualN: manualsResidual.length,
                residualEuro: manualsResidual.reduce((s, m) => s + m.euro, 0),
                stripeEu: stripeEuEuro / 100,
                feeSum: feeSum / 100,
                spese: speseEuro / 100,
                payouts: Math.abs(payouts._sum.totalCents || 0) / 100,
                equation: (paypalSum - feeSum + speseEuro - 56988) / 100,
                may3,
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
