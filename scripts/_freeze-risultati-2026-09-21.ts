/**
 * Freeze ufficiale risultati gestione/esercizio — 21 settembre 2026.
 * Sostituisce il riferimento 11/09 (−8450,18 / −3852,52).
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import { readErarioIvaFromLedger, syncErarioIvaYear } from '@/lib/financial/erarioIva';
import { controlC15 } from '@/lib/financial/dossierFiscalControls';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

async function main() {
    const at = new Date().toISOString();
    const label = 'FREEZE_UFFICIALE_2026-09-21_ERARIO_IVA_C15';

    await syncErarioIvaYear(2026);
    const erario = await readErarioIvaFromLedger(2026);
    const c15Results = [];
    for (const q of [1, 2, 3] as TaxQuarter[]) {
        c15Results.push(await controlC15(2026, q));
    }

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
            'Autofatture TD17: IVA letta dai documenti; credito solo fino al debito; sbilanci → work-list.',
            'Erario c/IVA patrimoniale (debito=corrispettivi, credito=fatture); fuori dal CE.',
            'C15: corrispettivi/fatture ↔ Erario; non blocca Registro Corrispettivi commercialista.',
        ],
        checks: {
            dcStudioKeepsInvoice: dcExpKept,
            dcStudioDropsBank: !dcBankKept,
            c15AllGreen: c15Results.every((c) => c.passed),
            c15: c15Results.map((c) => ({
                quarter: c.detail.match(/T(\d)/)?.[1],
                passed: c.passed,
                detail: c.detail,
            })),
            arcWorkListCount: pnl.autofattureRcWorkList?.length ?? 0,
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
            erarioIvaDebito: erario.debitoCents,
            erarioIvaCredito: erario.creditoCents,
            erarioIvaSaldo: erario.debitoCents - erario.creditoCents,
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
            erarioIvaDebito: euro(erario.debitoCents),
            erarioIvaCredito: euro(erario.creditoCents),
            erarioIvaSaldo: euro(erario.debitoCents - erario.creditoCents),
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
- Autofatture TD17: IVA letta dai documenti (credito solo fino al debito).
- Erario c/IVA patrimoniale (debito = corrispettivi; credito = fatture passive).
- C15 T1–T3: \`${c15Results.every((c) => c.passed)}\`.
- Check DC Studio: fattura tenuta=\`${dcExpKept}\`, bank soppressa=\`${!dcBankKept}\`.

## Risultati CE

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
| IVA PnL (ARC documentale) debito / credito | ${freeze.euro.ivaDebito} / ${freeze.euro.ivaCredito} |
| Saldo banca (Σ linee) | ${freeze.euro.cashBank} |

## Stato patrimoniale — Erario c/IVA

| Voce | Euro |
|------|------|
| IVA a debito (da corrispettivi) | ${freeze.euro.erarioIvaDebito} |
| IVA a credito (da fatture passive) | ${freeze.euro.erarioIvaCredito} |
| **Saldo Erario** (debito − credito) | **${freeze.euro.erarioIvaSaldo}** |

## C15
${c15Results.map((c) => `- ${c.passed ? 'OK' : 'AVVISO'}: ${c.detail}`).join('\n')}

`
    );

    console.log(JSON.stringify({ ok: true, jsonPath, mdPath, euro: freeze.euro, checks: freeze.checks }, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
