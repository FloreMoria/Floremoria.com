/**
 * Fase 4b — Lotto 5 DRY-RUN (sola lettura): SDD PayPal / giroconti / transito a 3 gambe.
 * Atteso socio: fino a €1.616 di costi doppi da togliere.
 *
 * Uso: npx tsx scripts/fase4b-lotto5-dryrun.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}
function dayKey(d: Date) {
    return d.toISOString().slice(0, 10);
}

const SDD_RE = /\b(sdd|sepa\s*direct|addebito\s*sdd|paypal\s*europe|preautorizzato)\b/i;
const COST_CATS = [
    'SPESE_OPERATIVE',
    'SPESE_SAAS',
    'COSTI_FIORISTI',
    'ALTRI_COSTI',
    'ONERI_BANCARI',
    'CONSULENZE',
    'IMPOSTE',
];

async function main() {
    const pre = await computeHistoricalPnl({ fiscalYear: 2026 });
    const costiTot =
        pre.costiFioristiCents +
        pre.costiFatturePassiveSdiCents +
        pre.costiSaasCents +
        pre.costiOperativiCents +
        pre.oneriBancariCents;

    const bank = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: 'BANK_LINE',
            OR: [{ direction: 'USCITA' }, { totalCents: { lt: 0 } }],
        },
        select: {
            id: true,
            totalCents: true,
            category: true,
            accountingDate: true,
            description: true,
            sourceKey: true,
            metadataJson: true,
        },
    });

    const sddAll = bank.filter((r) => SDD_RE.test(r.description || '') || /paypal/i.test(r.description || '') && /sdd|addebito|direct/i.test(r.description || ''));
    // Broad: Fineco lines mentioning PayPal as debit (funding/SDD)
    const paypalBankOut = bank.filter((r) => /paypal/i.test(r.description || ''));

    const sddStrict = bank.filter((r) => SDD_RE.test(r.description || ''));

    // Unique by day+abs amount
    function uniqueByDayAmt(rows: typeof bank) {
        const map = new Map<string, (typeof bank)[0]>();
        for (const r of rows) {
            const k = `${dayKey(r.accountingDate)}|${Math.abs(r.totalCents)}`;
            if (!map.has(k)) map.set(k, r);
        }
        return [...map.values()];
    }

    // Dup day+amount different categories
    function dupsDayAmt(rows: typeof bank) {
        const groups = new Map<string, typeof bank>();
        for (const r of rows) {
            const k = `${dayKey(r.accountingDate)}|${Math.abs(r.totalCents)}`;
            const arr = groups.get(k) || [];
            arr.push(r);
            groups.set(k, arr);
        }
        const dups: { key: string; amount: number; cats: string[]; n: number }[] = [];
        for (const [k, arr] of groups) {
            const cats = [...new Set(arr.map((a) => a.category))];
            if (arr.length >= 2 && cats.length >= 2) {
                dups.push({
                    key: k,
                    amount: Math.abs(arr[0].totalCents),
                    cats,
                    n: arr.length,
                });
            }
        }
        return dups;
    }

    const sddUniq = uniqueByDayAmt(sddStrict);
    const sddDups = dupsDayAmt(sddStrict);
    const sddDupEuro = sddDups.reduce((s, d) => s + d.amount, 0);

    const sddInCost = sddUniq.filter((r) => COST_CATS.includes(r.category));
    const sddInRicavi = sddUniq.filter((r) =>
        ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI'].includes(r.category)
    );
    const sddInTransito = sddUniq.filter(
        (r) => r.category === 'TRASFERIMENTO_INTERNO' || r.category === 'PAYPAL_PAYOUT'
    );

    const paypalBankInCost = paypalBankOut.filter((r) => COST_CATS.includes(r.category));
    const funding500 = paypalBankOut.filter((r) => Math.abs(r.totalCents) === 50_000);

    // Hierarchy view: how much of SDD-in-cost still hits PnL
    const all = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026 },
        select: {
            id: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            accountingDate: true,
            totalCents: true,
            direction: true,
            category: true,
            bankLineId: true,
            description: true,
            counterpartyName: true,
            attachmentUrl: true,
            metadataJson: true,
        },
    });
    const usable = applyFiscalAuthorityHierarchy(all);
    const usableIds = new Set(usable.map((u) => u.id));
    const sddCostVisible = sddInCost.filter((r) => usableIds.has(r.id));
    const sddRicaviVisible = sddInRicavi.filter((r) => usableIds.has(r.id));

    // Match SDD unique ↔ PayPal debit same amount ±7d (lower bound double-count)
    const ppDebits = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: 'PAYPAL_MOVEMENT',
            OR: [{ direction: 'USCITA' }, { totalCents: { lt: 0 } }],
        },
        select: { id: true, totalCents: true, accountingDate: true, description: true, category: true },
    });
    let matchN = 0;
    let matchCents = 0;
    const usedPp = new Set<string>();
    for (const s of sddUniq) {
        const abs = Math.abs(s.totalCents);
        const t0 = s.accountingDate.getTime();
        const mate = ppDebits.find((p) => {
            if (usedPp.has(p.id)) return false;
            if (Math.abs(p.totalCents) !== abs) return false;
            const dt = Math.abs(p.accountingDate.getTime() - t0) / 86400000;
            return dt <= 7;
        });
        if (mate) {
            usedPp.add(mate.id);
            matchN += 1;
            matchCents += abs;
        }
    }

    const attesoMax = 161_595; // €1.615,95 storico SDD grezzi
    const scenarioA_dupOnly = sddDupEuro;
    const scenarioB_costVisible = sddCostVisible.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const scenarioC_fullUniqToTransit = sddUniq
        .filter((r) => r.category !== 'TRASFERIMENTO_INTERNO' && r.category !== 'PAYPAL_PAYOUT')
        .reduce((s, r) => s + Math.abs(r.totalCents), 0);

    const out = {
        generatedAt: new Date().toISOString(),
        vincolo: 'SOLA LETTURA — nessun write Lotto 5',
        pnlPre: {
            rai: euro(pre.risultatoAnteImposteCents),
            costiTot: euro(costiTot),
            banca: euro(pre.cashBankBalanceCents),
        },
        sdd: {
            strictRows: sddStrict.length,
            strictEuro: euro(sddStrict.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            uniqueDayAmt: sddUniq.length,
            uniqueEuro: euro(sddUniq.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            dupsMultiCat: { n: sddDups.length, euro: euro(sddDupEuro), sample: sddDups.slice(0, 10) },
            inCostUnique: {
                n: sddInCost.length,
                euro: euro(sddInCost.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            },
            inRicaviUnique: {
                n: sddInRicavi.length,
                euro: euro(sddInRicavi.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            },
            inTransitoUnique: {
                n: sddInTransito.length,
                euro: euro(sddInTransito.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            },
            costVisibleInPnl: {
                n: sddCostVisible.length,
                euro: euro(scenarioB_costVisible),
            },
            ricaviVisibleInPnl: {
                n: sddRicaviVisible.length,
                euro: euro(sddRicaviVisible.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            },
        },
        paypalBankOut: {
            n: paypalBankOut.length,
            euro: euro(paypalBankOut.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            inCost: {
                n: paypalBankInCost.length,
                euro: euro(paypalBankInCost.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            },
            funding500: funding500.map((r) => ({
                id: r.id,
                date: dayKey(r.accountingDate),
                cat: r.category,
                amount: euro(r.totalCents),
            })),
        },
        matchSddToPaypalDebit: { n: matchN, euro: euro(matchCents) },
        scenariAttesi: {
            socioMax: euro(attesoMax),
            A_soloDupCategorie: euro(scenarioA_dupOnly),
            B_sddUniciAncoraCostoInPnl: euro(scenarioB_costVisible),
            C_riclassificaTuttiSddNonTransito: euro(scenarioC_fullUniqToTransit),
            nota: 'Lotto 5 MUOVE il CE (al contrario del Lotto 4): riclassifica SDD da costo/ricavo errato a TRASFERIMENTO_INTERNO. Acceptance: costi scendono, RAI migliora, banca invariata.',
        },
        stop: 'Dry-run only — via libera richiesta prima di eseguire',
    };

    const md = `# Fase 4b — Lotto 5 DRY-RUN (SDD / giroconti / transito)

**Generato:** ${out.generatedAt}  
**Vincolo:** sola lettura — **nessuna scrittura**

---

## Contesto post-Lotto 4

Lotto 4 ha pulito il mastro a CE invariato. Il Lotto 5 è l’ultimo lotto che può **migliorare** il risultato (atteso socio fino a **€1.616**).

| PnL live pre-L5 | |
|--|--|
| RAI | ${euro(pre.risultatoAnteImposteCents)} |
| Costi tot | ${euro(costiTot)} |
| Banca | ${euro(pre.cashBankBalanceCents)} |

---

## SDD Fineco (strict)

| | N | Euro |
|--|---|------|
| Righe grezze | ${sddStrict.length} | ${out.sdd.strictEuro} |
| Unici giorno+importo | ${sddUniq.length} | ${out.sdd.uniqueEuro} |
| Doppi multi-categoria | ${sddDups.length} | ${euro(sddDupEuro)} |
| Unici ancora in **costo** | ${sddInCost.length} | ${out.sdd.inCostUnique.euro} |
| Unici etichettati **ricavi** | ${sddInRicavi.length} | ${out.sdd.inRicaviUnique.euro} |
| Unici già **transito** | ${sddInTransito.length} | ${out.sdd.inTransitoUnique.euro} |
| Costo ancora **visibile in PnL** | ${sddCostVisible.length} | ${euro(scenarioB_costVisible)} |
| Match stretto ↔ debito PayPal (±7g) | ${matchN} | ${euro(matchCents)} |

Funding €500 Fineco→PayPal: ${funding500.length ? funding500.map((r) => `${dayKey(r.accountingDate)} ${r.category} ${euro(r.totalCents)}`).join('; ') : '_non in costo / già riclassificato_'}

---

## Scenari (attesi dichiarati — non eseguiti)

| Scenario | Euro | Natura |
|----------|------|--------|
| Socio max (SDD grezzi storici) | ${euro(attesoMax)} | tetto |
| A — solo dedup multi-cat | ${euro(scenarioA_dupOnly)} | soft-reverse duplicato |
| B — SDD unici ancora costo in PnL | ${euro(scenarioB_costVisible)} | riclassifica → transito |
| C — tutti SDD non-transito → funding | ${euro(scenarioC_fullUniqToTransit)} | tesi piena |

**Acceptance Lotto 5 (opposta al L4):** costi e RAI **si muovono** (migliorano); **banca invariata**; IVA tipicamente invariata.

---

## STOP

Nessuna esecuzione. Attendere via libera esplicita al Lotto 5.
`;

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(join(base, 'dossier_fase4b_lotto5_dryrun.json'), JSON.stringify(out, null, 2));
    writeFileSync(join(base, 'dossier_fase4b_lotto5_dryrun.md'), md);
    console.log(
        JSON.stringify(
            {
                sddUniqEuro: out.sdd.uniqueEuro,
                scenarioB: euro(scenarioB_costVisible),
                scenarioC: euro(scenarioC_fullUniqToTransit),
                rai: euro(pre.risultatoAnteImposteCents),
            },
            null,
            2
        )
    );
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
