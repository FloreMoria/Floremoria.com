/**
 * Fase 4b Lotto 3 — DRY-RUN payout (87 / €4080,29). ZERO scritture.
 * Uso: npx tsx scripts/fase4b-lotto3-dryrun.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { dryRunClassifyBankLine } from '../lib/financial/payoutClassification';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

async function main() {
    const snapshotAt = new Date().toISOString();
    const pnlBefore = await computeHistoricalPnl({ fiscalYear: 2026 });

    const revenueBank = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'BANK_LINE',
            category: {
                in: ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI', 'CONTRIBUTI_ESERCIZIO'],
            },
        },
        select: {
            id: true,
            totalCents: true,
            category: true,
            bankLineId: true,
            sourceId: true,
            vatCents: true,
            description: true,
            accountingDate: true,
            fiscalYear: true,
        },
    });

    const targets: Array<{
        id: string;
        category: string;
        totalCents: number;
        vatCents: number;
        bankLineId: string;
        date: string;
        description: string;
    }> = [];

    for (const r of revenueBank) {
        const blId = r.bankLineId || r.sourceId;
        if (!blId) continue;
        const line = await prisma.bankStatementLine.findUnique({
            where: { id: blId },
            select: {
                id: true,
                amountCents: true,
                accountingDate: true,
                valueDate: true,
                description: true,
                matchType: true,
            },
        });
        if (!line || line.amountCents <= 0) continue;
        const cls = await dryRunClassifyBankLine(line);
        if (cls.kind !== 'PAYOUT_MATCHED') continue;
        targets.push({
            id: r.id,
            category: r.category,
            totalCents: r.totalCents,
            vatCents: r.vatCents,
            bankLineId: line.id,
            date: r.accountingDate.toISOString().slice(0, 10),
            description: r.description.slice(0, 100),
        });
    }

    const byCat: Record<string, { n: number; cents: number }> = {};
    for (const t of targets) {
        if (!byCat[t.category]) byCat[t.category] = { n: 0, cents: 0 };
        byCat[t.category].n++;
        byCat[t.category].cents += Math.abs(t.totalCents);
    }

    // Hierarchy impact on RICAVI_VENDITE
    const all = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            category: true,
            totalCents: true,
            direction: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            bankLineId: true,
            vatCents: true,
            netCents: true,
            accountingDate: true,
            metadataJson: true,
        },
    });
    const usable = applyFiscalAuthorityHierarchy(all);
    const usableIds = new Set(usable.map((r) => r.id));
    let ricaviVenditeInHier = 0;
    let ricaviVenditeInHierN = 0;
    for (const t of targets) {
        if (t.category !== 'RICAVI_VENDITE') continue;
        if (usableIds.has(t.id)) {
            ricaviVenditeInHier += Math.abs(t.totalCents);
            ricaviVenditeInHierN++;
        }
    }

    const venditeBefore = pnlBefore.venditeCaratteristicheCents ?? 0;
    const venditeAfterExpected = venditeBefore - ricaviVenditeInHier;
    const raiBefore = pnlBefore.risultatoAnteImposteCents;
    // Reclass to TRASFERIMENTO_INTERNO: exits ricavi, RAI rises by ricaviVenditeInHier
    // (altri already out of hierarchy → RAI unchanged for those)
    const raiAfterExpected = raiBefore + ricaviVenditeInHier;

    // Sales picture (business, not motor-only)
    const euMissing = 203691;
    const paypalNegRicavi = 162304; // mislabeled costs — do NOT add to motor vendite
    const salesPicture = {
        venditeComPostLotto3_motore: euro(venditeAfterExpected),
        euOrdiniMancantiOrder: euro(euMissing),
        paypalSpeseMalEtichettateComeRicaviNegativi: euro(paypalNegRicavi),
        notaPaypal1623:
            'Nel motore PnL attuale queste USCITA non riducono venditeCaratteristiche (vanno nei costi). Nel quadro «vendite vere» del titolare vanno tolte dal racconto ricavi, non sommate alle vendite.',
        sommaTitolareIndicativa:
            euro(venditeAfterExpected + euMissing) +
            ' (.com post-L3 + .eu mancanti). I €1.623 non si aggiungono alle vendite.',
        sommaSeQualcunoSommasseErroneamente1623: euro(
            venditeAfterExpected + euMissing + paypalNegRicavi
        ),
    };

    const bankInv = 3240361; // declared invariant
    const report = {
        mode: 'DRY-RUN',
        snapshotAt,
        batchIdProposed: `FASE4B_L3_<UTC_at_execute>`,
        action: 'RECLASS → TRASFERIMENTO_INTERNO (non storno contabile a nuovo reverse se riclassifica metadata+category)',
        preWrite: {
            venditeCaratteristiche: euro(venditeBefore),
            altriRicavi: euro(pnlBefore.altriRicaviCents ?? 0),
            contributi: euro(pnlBefore.contributiEsercizioCents ?? 0),
            ricaviLordi: euro(pnlBefore.ricaviLordiCents),
            risultatoAnteImposte: euro(raiBefore),
            ivaDebito: euro(pnlBefore.ivaDebitoCents),
            entriesActive: await prisma.financialLedgerEntry.count({
                where: { reversedAt: null },
            }),
        },
        targets: {
            n: targets.length,
            total: euro(targets.reduce((s, t) => s + Math.abs(t.totalCents), 0)),
            byCategory: Object.fromEntries(
                Object.entries(byCat).map(([k, v]) => [k, { n: v.n, euro: euro(v.cents) }])
            ),
            ricaviVenditeSurvivingHierarchy: {
                n: ricaviVenditeInHierN,
                euro: euro(ricaviVenditeInHier),
            },
        },
        expectedPostWrite: {
            venditeCaratteristiche: euro(venditeAfterExpected),
            venditeCaratteristicheCents: venditeAfterExpected,
            risultatoAnteImposte: euro(raiAfterExpected),
            bancaInvarianteDichiarato: euro(bankInv),
            iva: 'invariata (vatCents=0 sulle 87)',
            noteRai:
                'RAI sale di ≈ quota payout oggi in RICAVI_VENDITE in gerarchia (escono dai ricavi). Verificare a esecuzione.',
        },
        salesPictureCompleto: salesPicture,
        sampleRows: targets.slice(0, 8),
    };

    const md = `# Fase 4b — Lotto 3 DRY-RUN (payout gateway)

**Snapshot:** \`${snapshotAt}\`  
**Modalità:** DRY-RUN — **zero scritture**  
**batch_id:** assegnato solo all’esecuzione \`FASE4B_L3_<UTC>\`

---

## Pre-write (congelato)

| Metrica | Valore |
|---------|--------|
| Vendite caratteristiche | ${report.preWrite.venditeCaratteristiche} |
| Altri ricavi | ${report.preWrite.altriRicavi} |
| Contributi esercizio | ${report.preWrite.contributi} |
| Ricavi lordi | ${report.preWrite.ricaviLordi} |
| Risultato ante imposte | ${report.preWrite.risultatoAnteImposte} |
| IVA debito | ${report.preWrite.ivaDebito} |
| Entry attive | ${report.preWrite.entriesActive} |

---

## Target

| | |
|--|--|
| Righe | **${targets.length}** (atteso 87) |
| Totale | **${report.targets.total}** (atteso €4.080,29) |
| Di cui \`RICAVI_VENDITE\` in gerarchia PnL | ${ricaviVenditeInHierN} · ${euro(ricaviVenditeInHier)} |
| Per categoria | ${JSON.stringify(report.targets.byCategory)} |

Azione proposta: \`category\` → \`TRASFERIMENTO_INTERNO\` + metadata \`fase4bBatchId\` / \`fase4bLotto=3\` / \`fase4bAction=RECLASS\` (Dare/Avere transito gateway). **Non** delete.

---

## Effetto atteso post-write (motore)

| Metrica | Atteso |
|---------|--------|
| Vendite caratteristiche | **${euro(venditeAfterExpected)}** |
| Risultato ante imposte | ${euro(raiAfterExpected)} (≈ +${euro(ricaviVenditeInHier)} vs pre se escono dai ricavi) |
| Banca invariante dichiarato | ${euro(bankInv)} (invariato; avvertenza riga fantasma resta) |
| IVA | invariata |

---

## Quadro vendite 2026 (completo pezzi, non ufficiale fiscale)

| Pezzo | Euro | Ruolo |
|-------|------|-------|
| Vendite \`.com\` post-Lotto 3 (motore) | **${euro(venditeAfterExpected)}** | PnL \`RICAVI_VENDITE\` dopo riclassifica payout |
| Ordini \`.eu\` assenti da \`Order\` | **€2.036,91** | Corrispettivi da registro (lista titolare) |
| Spese PayPal etichettate \`RICAVI_VENDITE\` negativi | **€1.623,04** | **Non sono vendite** — costi mal classificati; nel motore non alzano le vendite |

**Somma vendite caratteristiche di lavoro (.com post-L3 + .eu mancanti):** **${euro(venditeAfterExpected + euMissing)}**  
(I €1.623 non si aggiungono; se sommati per errore si otterrebbe ${euro(venditeAfterExpected + euMissing + paypalNegRicavi)}.)

---

## STOP

Dry-run pronto. **Nessuna mutazione eseguita.**  
Attendo via libera esplicito all’esecuzione Lotto 3.
`;

    const out = path.join(process.cwd(), 'docs/verbali/dossier_fase4b_lotto3_dryrun.md');
    fs.writeFileSync(out, md, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    console.log('[lotto3-dryrun] wrote', out);
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
