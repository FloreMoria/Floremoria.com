/**
 * Freeze ufficiale risultati gestione/esercizio — 21 settembre 2026.
 * Sostituisce il riferimento 11/09 (−8450,18 / −3852,52).
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

async function main() {
    const at = new Date().toISOString();
    const label = 'FREEZE_UFFICIALE_2026-09-21_DEDUPE_FATTURA_RIMBORSI';
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const contributi = pnl.contributiEsercizioCents || 0;
    const esercizio = pnl.risultatoAnteImposteCents;
    const gestione = esercizio - contributi;

    const bankAgg = await prisma.bankStatementLine.aggregate({
        _sum: { amountCents: true },
    });

    // Spot-check DC Studio: fattura tenuta, bank soppressa
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            OR: [
                { sourceKey: { contains: 'cmt2q4dvb0019jl04xfxs7wfj' } },
                { sourceKey: { contains: 'cmt311c5f000sl4041s82u7pg' } },
            ],
        },
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
    const all = await prisma.financialLedgerEntry.findMany({
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
    const after = applyFiscalAuthorityHierarchy(all as never[]);
    const dcExpKept = after.some((r) => (r.sourceKey || '').includes('cmt2q4dvb0019jl04xfxs7wfj'));
    const dcBankKept = after.some((r) => (r.sourceKey || '').includes('cmt311c5f000sl4041s82u7pg'));

    const freeze = {
        label,
        at,
        replaces: null,
        engineNotes: [
            'Dedupe costi: fattura passiva prevale sul bonifico (regolamento).',
            'Rimborsi cliente (USCITA) riducono ricavi/vendite, non aumentano i costi.',
            'Autofatture TD17 → AUTOFATTURE_REVERSE_CHARGE (effetto CE nullo; IVA debito/credito).',
            'PayPal HAYUM vendite in RICAVI_VENDITE (non più ARCH_PAYPAL_NOT_GATEWAY).',
        ],
        checks: {
            dcStudioKeepsInvoice: dcExpKept,
            dcStudioDropsBank: !dcBankKept,
            dcStudioLedgerRows: rows.map((r) => ({
                sourceKey: r.sourceKey,
                category: r.category,
                totalCents: r.totalCents,
                vatCents: r.vatCents,
            })),
        },
        cents: {
            ricaviLordi: pnl.ricaviLordiCents,
            venditeCaratteristiche: pnl.venditeCaratteristicheCents,
            altriRicavi: pnl.altriRicaviCents,
            contributiEsercizio: contributi,
            rimborsiInRicaviNet: pnl.rimborsiInRicaviCents,
            costiFioristi: pnl.costiFioristiCents,
            costiFatturePassiveSdi: pnl.costiFatturePassiveSdiCents,
            costiSaas: pnl.costiSaasCents,
            costiOperativi: pnl.costiOperativiCents,
            oneriBancari: pnl.oneriBancariCents,
            ebitda: pnl.ebitdaCents,
            risultatoEsercizio: esercizio,
            risultatoGestione: gestione,
            ivaDebito: pnl.ivaDebitoCents,
            ivaCredito: pnl.ivaCreditoCents,
            cashBank: bankAgg._sum.amountCents || 0,
        },
        euro: {
            ricaviLordi: euro(pnl.ricaviLordiCents),
            venditeCaratteristiche: euro(pnl.venditeCaratteristicheCents),
            altriRicavi: euro(pnl.altriRicaviCents),
            contributiEsercizio: euro(contributi),
            rimborsiInRicaviNet: euro(pnl.rimborsiInRicaviCents),
            costiFioristi: euro(pnl.costiFioristiCents),
            costiFatturePassiveSdi: euro(pnl.costiFatturePassiveSdiCents),
            costiSaas: euro(pnl.costiSaasCents),
            costiOperativi: euro(pnl.costiOperativiCents),
            oneriBancari: euro(pnl.oneriBancariCents),
            ebitda: euro(pnl.ebitdaCents),
            risultatoEsercizio: euro(esercizio),
            risultatoGestione: euro(gestione),
            ivaDebito: euro(pnl.ivaDebitoCents),
            ivaCredito: euro(pnl.ivaCreditoCents),
            cashBank: euro(bankAgg._sum.amountCents || 0),
        },
    };

    const base = join(process.cwd(), 'docs/verbali');
    const jsonPath = join(base, '2026-09-21-freeze-risultati.json');
    const mdPath = join(base, '2026-09-21-freeze-risultati.md');

    writeFileSync(jsonPath, JSON.stringify(freeze, null, 2));
    writeFileSync(
        mdPath,
        `# FREEZE UFFICIALE — 21 settembre 2026

**Label:** \`${label}\`  
**Timestamp:** \`${at}\`  
**Riferimento di progetto:** questo freeze (21/09). Non usare snapshot precedenti.

## Motore

- Dedupe costi: **fattura passiva** tiene il CE; bonifico = regolamento (allegato).
- Rimborsi cliente (USCITA): **riduzione di ricavo**, non costo operativo.
- Autofatture TD17: categoria \`AUTOFATTURE_REVERSE_CHARGE\` (fuori ricavi; IVA debito = credito).
- PayPal HAYUM: vendite in \`RICAVI_VENDITE\` (allineate al registro corrispettivi).
- Check DC Studio: fattura tenuta=\`${dcExpKept}\`, bank soppressa=\`${!dcBankKept}\`.

## Risultati

| Voce | Euro |
|------|------|
| Ricavi lordi | ${freeze.euro.ricaviLordi} |
| — Vendite caratteristiche | ${freeze.euro.venditeCaratteristiche} |
| — Contributi CCIAA | ${freeze.euro.contributiEsercizio} |
| — Altri ricavi | ${freeze.euro.altriRicavi} |
| — Rimborsi (netto in ricavi) | ${freeze.euro.rimborsiInRicaviNet} |
| Costi fioristi | ${freeze.euro.costiFioristi} |
| Costi fatture passive | ${freeze.euro.costiFatturePassiveSdi} |
| SaaS | ${freeze.euro.costiSaas} |
| Operativi | ${freeze.euro.costiOperativi} |
| Oneri bancari | ${freeze.euro.oneriBancari} |
| EBITDA | ${freeze.euro.ebitda} |
| **Risultato esercizio** (con CCIAA) | **${freeze.euro.risultatoEsercizio}** |
| **Risultato gestione** (senza CCIAA) | **${freeze.euro.risultatoGestione}** |
| IVA a debito | ${freeze.euro.ivaDebito} |
| IVA a credito | ${freeze.euro.ivaCredito} |
| Saldo banca (Σ linee) | ${freeze.euro.cashBank} |

`
    );

    console.log(JSON.stringify({ ok: true, jsonPath, mdPath, euro: freeze.euro, checks: freeze.checks }, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
