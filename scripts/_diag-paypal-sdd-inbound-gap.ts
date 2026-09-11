/**
 * Diagnosi gap PayPal sales + SDD mirror (sola lettura).
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import prisma from '@/lib/prisma';
import { loadPaypalSalesReport } from '@/lib/financial/paypalSalesReports';

function parseEuro(s: string): number {
    const t = (s || '').trim();
    if (!t) return 0;
    if (t.includes(',') && t.includes('.')) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
    if (t.includes(',')) return parseFloat(t.replace(',', '.'));
    return parseFloat(t);
}

async function main() {
    const ytd = loadPaypalSalesReport('YTD');
    const TX_CSV = '/Users/floremoria/Downloads/Transazioni PayPal FloreMoria 2026.CSV';
    const raw = fs.readFileSync(TX_CSV, 'utf8');
    const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });

    const reportBuckets = new Map(
        ytd.parsed.daily.map((d) => [d.date, { qty: d.qty, volumeCents: d.volumeCents, used: 0 }])
    );
    const sales: Array<{
        date: string;
        cents: number;
        feeCents: number;
        txId: string;
        name: string;
        type: string;
        synthetic?: boolean;
    }> = [];
    for (const row of parsed.data) {
        const tipo = row['Tipo'] || '';
        const lordo = Math.round(parseEuro(row['Lordo'] || '') * 100);
        const fee = Math.round(Math.abs(parseEuro(row['Tariffa'] || '')) * 100);
        if (lordo <= 0 || row['Impatto sul saldo'] !== 'Accredito') continue;
        const isSale =
            /Pagamento Express Checkout|Pagamento da cellulare|Pagamento generico|Pay Later/i.test(
                tipo
            ) ||
            (/Pagamento/i.test(tipo) && !/preautorizzato|utenza|carta di debito/i.test(tipo));
        if (!isSale) continue;
        const dm = (row['Data'] || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!dm) continue;
        const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
        if (date > '2026-09-10') continue;
        const b = reportBuckets.get(date);
        if (b && b.used < b.qty) {
            b.used++;
            sales.push({
                date,
                cents: lordo,
                feeCents: fee,
                txId: row['Codice transazione'] || '',
                name: row['Nome'] || '',
                type: tipo,
            });
        }
    }
    for (const [date, b] of reportBuckets) {
        const need = b.qty - b.used;
        if (need <= 0) continue;
        const usedCents = sales.filter((s) => s.date === date).reduce((s, x) => s + x.cents, 0);
        const remain = b.volumeCents - usedCents;
        const unit = Math.round(remain / need);
        for (let i = 0; i < need; i++) {
            const c = i === need - 1 ? remain - unit * (need - 1) : unit;
            sales.push({
                date,
                cents: c,
                feeCents: 0,
                txId: '',
                name: '',
                type: 'SYNTHETIC',
                synthetic: true,
            });
        }
    }
    console.log(
        'sales',
        sales.length,
        sales.reduce((s, x) => s + x.cents, 0) / 100,
        'feesCSV',
        sales.reduce((s, x) => s + x.feeCents, 0) / 100
    );

    const present: typeof sales = [];
    const missing: Array<(typeof sales)[0] & { ledger: any }> = [];
    for (const s of sales) {
        let row = null as any;
        if (s.txId) {
            row = await prisma.financialLedgerEntry.findFirst({
                where: { sourceKey: `PAYPAL_TX:${s.txId}` },
                select: {
                    id: true,
                    reversedAt: true,
                    totalCents: true,
                    category: true,
                    sourceKey: true,
                    metadataJson: true,
                },
            });
        }
        if (row && !row.reversedAt && row.totalCents > 0) present.push(s);
        else missing.push({ ...s, ledger: row });
    }
    console.log(
        'present',
        present.length,
        present.reduce((s, x) => s + x.cents, 0) / 100
    );
    console.log(
        'missing',
        missing.length,
        missing.reduce((s, x) => s + x.cents, 0) / 100
    );
    for (const m of missing) {
        console.log(
            ' MISS',
            m.date,
            m.cents / 100,
            m.txId || '(synth)',
            m.name,
            m.ledger
                ? `rev=${!!m.ledger.reversedAt} cat=${m.ledger.category} c=${m.ledger.totalCents}`
                : 'NO_ROW'
        );
    }

    const sdd = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            description: { contains: 'PayPal', mode: 'insensitive' },
        },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            category: true,
            description: true,
            accountingDate: true,
            metadataJson: true,
        },
    });
    const sddPp = sdd.filter(
        (r) => /sdd|addebito\s*sdd|adde bito sdd/i.test(r.description || '') && r.totalCents < 0
    );
    console.log('sdd n', sddPp.length, sddPp.reduce((s, r) => s + r.totalCents, 0) / 100);
    const fund = await prisma.financialLedgerEntry.count({
        where: { sourceKey: { startsWith: 'PAYPAL_SDD_FUNDING:' }, reversedAt: null },
    });
    console.log('PAYPAL_SDD_FUNDING', fund);
    console.log(
        'sample',
        sddPp[0]?.sourceKey,
        sddPp[0]?.category,
        JSON.stringify(sddPp[0]?.metadataJson)?.slice(0, 250)
    );

    let feeSum = 0;
    let feeFromLedger = 0;
    let feeFromCsv = 0;
    for (const s of sales) {
        if (!s.txId) continue;
        const f = await prisma.financialLedgerEntry.findFirst({
            where: { sourceKey: `PAYPAL_FEE:${s.txId}`, reversedAt: null },
        });
        if (f) {
            feeFromLedger += Math.abs(f.totalCents);
            feeSum += Math.abs(f.totalCents);
        } else {
            feeFromCsv += s.feeCents;
            feeSum += s.feeCents;
        }
    }
    console.log({ feeSum: feeSum / 100, feeFromLedger: feeFromLedger / 100, feeFromCsv: feeFromCsv / 100 });

    // How does sumPaypalPaymentAccount count? check TI credits meta
    const ti = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'PAYPAL_TX:' },
            totalCents: { gt: 0 },
        },
        select: { sourceKey: true, totalCents: true, category: true, metadataJson: true },
    });
    console.log(
        'PAYPAL_TX positive',
        ti.length,
        ti.reduce((s, r) => s + r.totalCents, 0) / 100,
        'by cat',
        Object.fromEntries(
            [...new Set(ti.map((r) => r.category))].map((c) => [
                c,
                ti.filter((r) => r.category === c).reduce((s, r) => s + r.totalCents, 0) / 100,
            ])
        )
    );

    await prisma.$disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
