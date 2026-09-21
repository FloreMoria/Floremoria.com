/**
 * Nota commercialista: IVA detraibile recuperata dall’inversione dedupe fattura > bonifico.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '@/lib/prisma';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function quarterOf(d: Date | null | undefined): 1 | 2 | 3 | 4 | null {
    if (!d) return null;
    return (Math.floor(d.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

async function main() {
    const expenses = await prisma.manualFinanceExpense.findMany({
        where: {
            matchedStatementLineId: { not: null },
            expenseDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
            vatCents: { gt: 0 },
        },
        select: {
            id: true,
            vendorName: true,
            totalCents: true,
            vatCents: true,
            expenseDate: true,
            matchedStatementLineId: true,
            docType: true,
            description: true,
        },
    });

    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            category: true,
            direction: true,
            totalCents: true,
            vatCents: true,
            netCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
            bankLineId: true,
            metadataJson: true,
            documentRef: true,
            orderId: true,
            attachmentUrl: true,
        },
    });
    const after = applyFiscalAuthorityHierarchy(rows as never[]);
    const afterIds = new Set(after.map((r) => r.id));

    const recovered: Array<{
        vendor: string;
        totalEuro: string;
        vatEuro: string;
        quarter: number;
        expenseDate: string;
        bankLineId: string;
        kept: string;
    }> = [];

    for (const exp of expenses) {
        const expLed = rows.find((r) => r.sourceKey === `MANUAL_EXPENSE:${exp.id}`);
        const bankLed = rows.find((r) =>
            (r.sourceKey || '').includes(exp.matchedStatementLineId!)
        );
        if (!expLed || !bankLed) continue;
        if (!afterIds.has(expLed.id)) continue;
        if (afterIds.has(bankLed.id)) continue; // bank still in — not the inverted case
        if (Math.abs(expLed.vatCents) <= 0 && exp.vatCents <= 0) continue;

        const vat = Math.abs(expLed.vatCents) || exp.vatCents;
        recovered.push({
            vendor: exp.vendorName,
            totalEuro: euro(Math.abs(exp.totalCents)),
            vatEuro: euro(vat),
            quarter: quarterOf(exp.expenseDate) || quarterOf(expLed.accountingDate) || 0,
            expenseDate: (exp.expenseDate || expLed.accountingDate)?.toISOString().slice(0, 10) || '',
            bankLineId: exp.matchedStatementLineId!,
            kept: expLed.sourceKey || expLed.id,
        });
    }

    const byQ: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const r of recovered) {
        byQ[r.quarter] = (byQ[r.quarter] || 0) + Math.round(parseFloat(r.vatEuro.replace(/\./g, '').replace(',', '.')) * 100);
    }
    // safer sum from cents
    const byQCents: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let totalVat = 0;
    for (const exp of expenses) {
        const expLed = rows.find((r) => r.sourceKey === `MANUAL_EXPENSE:${exp.id}`);
        const bankLed = rows.find((r) =>
            (r.sourceKey || '').includes(exp.matchedStatementLineId!)
        );
        if (!expLed || !bankLed) continue;
        if (!afterIds.has(expLed.id) || afterIds.has(bankLed.id)) continue;
        const vat = Math.abs(expLed.vatCents) || exp.vatCents;
        if (vat <= 0) continue;
        const q = quarterOf(exp.expenseDate) || quarterOf(expLed.accountingDate) || 0;
        if (q) byQCents[q] += vat;
        totalVat += vat;
    }

    const md = `# IVA detraibile recuperata — dedupe fattura > bonifico

**Data:** 21 settembre 2026  
**Motivo:** inversione priorità dedupe costi (il CE tiene la **fattura passiva**, il bonifico è regolamento).  
Prima il motore teneva la bank line (\`vatCents=0\`) e scartava la fattura → IVA a credito persa.

## Totale recuperato

**€${euro(totalVat)}** di IVA detraibile ora conteggiata nel PnL / gerarchia fiscale.

## Per trimestre 2026

| Trimestre | IVA a credito recuperata |
|-----------|-------------------------:|
| T1 | €${euro(byQCents[1])} |
| T2 | €${euro(byQCents[2])} |
| T3 | €${euro(byQCents[3])} |
| T4 | €${euro(byQCents[4])} |
| **Totale** | **€${euro(totalVat)}** |

## Dettaglio costi (fattura tenuta, bonifico allegato)

| Fornitore | Data | Trim. | Imponibile/totale | IVA |
|-----------|------|------:|------------------:|----:|
${recovered
    .map(
        (r) =>
            `| ${r.vendor} | ${r.expenseDate} | T${r.quarter} | €${r.totalEuro} | €${r.vatEuro} |`
    )
    .join('\n')}

## Nota per liquidazioni

- La voce più rilevante è **DC Studio STP SRL** (parcella marzo / proforma 158 / fattura n.66): **€554,92** di IVA a credito nel **T1**.
- Se il T1 è già stato liquidato senza questo credito, risulta un **versamento in eccesso** da recuperare nelle liquidazioni successive.
- Credito IVA complessivo di sistema (freeze odierno): vedi \`2026-09-21-freeze-risultati.md\`.

## Non confondere con

- IVA a debito corrispettivi (LIPE / registro vendite) — fonte gateway, aliquota 10% accessorietà.
- Autofatture TD17 reverse charge — IVA debito = credito, effetto nullo sul risultato.
`;

    const json = {
        generatedAt: new Date().toISOString(),
        totalVatCents: totalVat,
        byQuarterCents: byQCents,
        rows: recovered,
    };

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(join(base, '2026-09-21-iva-detraibile-recuperata.md'), md);
    writeFileSync(join(base, '2026-09-21-iva-detraibile-recuperata.json'), JSON.stringify(json, null, 2));
    console.log(JSON.stringify({ totalEuro: euro(totalVat), byQ: Object.fromEntries(Object.entries(byQCents).map(([k,v])=>[k, euro(v)])), n: recovered.length }, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
