/**
 * Post-Lotto4: chiarimenti + freeze ufficiale + L5 dry-run aggiornato + L6 competenza (sola lettura).
 * Uso: npx tsx scripts/fase4b-post-l4-freeze-l5-l6.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync, appendFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';
import { compareGatewayTransitBalances } from '../lib/financial/gatewayTransitBalance';

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

const SDD_RE = /\b(sdd|sepa\s*direct|addebito\s*sdd)\b/i;

async function main() {
    const freezeAt = new Date().toISOString();
    const p = await computeHistoricalPnl({ fiscalYear: 2026 });
    const costiTot =
        p.costiFioristiCents +
        p.costiFatturePassiveSdiCents +
        p.costiSaasCents +
        p.costiOperativiCents +
        p.oneriBancariCents;
    const active = await prisma.financialLedgerEntry.count({
        where: { reversedAt: null, fiscalYear: 2026 },
    });
    const reversed = await prisma.financialLedgerEntry.count({
        where: { reversedAt: { not: null }, fiscalYear: 2026 },
    });
    let transit: unknown = null;
    try {
        transit = await compareGatewayTransitBalances();
    } catch (e) {
        transit = { error: String(e) };
    }

    // ── :v analysis ────────────────────────────────────────────────────
    const jsonAll = await prisma.financialLedgerEntry.findMany({
        where: { fiscalYear: 2026, sourceType: 'JSON_ENTRY' },
        select: {
            sourceKey: true,
            reversedAt: true,
            direction: true,
            totalCents: true,
            createdAt: true,
            metadataJson: true,
        },
    });
    const isV = (k: string) => /:v\d+$/.test(k || '');
    const baseOf = (k: string) => (k || '').replace(/:v\d+$/, '');
    const versioned = jsonAll.filter((r) => isV(r.sourceKey || ''));
    const byBase = new Map<string, { base: number; vers: number }>();
    for (const r of jsonAll) {
        const b = baseOf(r.sourceKey || '');
        if (!byBase.has(b)) byBase.set(b, { base: 0, vers: 0 });
        const g = byBase.get(b)!;
        if (isV(r.sourceKey || '')) g.vers += 1;
        else g.base += 1;
    }
    let withBase = 0;
    let orphans = 0;
    for (const g of byBase.values()) {
        if (g.vers && g.base) withBase += g.vers;
        else if (g.vers && !g.base) orphans += g.vers;
    }
    const createdDays: Record<string, number> = {};
    for (const r of versioned) {
        const d = dayKey(r.createdAt);
        createdDays[d] = (createdDays[d] || 0) + 1;
    }
    const vActive = versioned.filter((r) => !r.reversedAt).length;

    // ── L5 true RAI impact ─────────────────────────────────────────────
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
    const bankOut = all.filter(
        (r) => r.sourceType === 'BANK_LINE' && (r.direction === 'USCITA' || r.totalCents < 0)
    );
    const sdd = bankOut.filter((r) => SDD_RE.test(r.description || ''));
    const uniqMap = new Map<string, (typeof sdd)[0]>();
    for (const r of sdd) {
        const k = `${dayKey(r.accountingDate)}|${Math.abs(r.totalCents)}`;
        if (!uniqMap.has(k)) uniqMap.set(k, r);
    }
    const uniq = [...uniqMap.values()];
    const uniqIds = new Set(uniq.map((u) => u.id));
    let costiHit = 0;
    let ricaviHit = 0;
    for (const r of usable) {
        if (!uniqIds.has(r.id)) continue;
        if (r.category === 'TRASFERIMENTO_INTERNO' || r.category === 'PAYPAL_PAYOUT') continue;
        const abs = Math.abs(r.totalCents);
        if (r.direction === 'ENTRATA' || r.totalCents > 0) {
            if (
                ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'CONTRIBUTI_ESERCIZIO', 'RIMBORSI'].includes(
                    r.category
                )
            ) {
                ricaviHit += abs;
            }
        } else {
            costiHit += abs;
        }
    }
    const deltaRaiL5 = costiHit - ricaviHit;
    const funding500 = bankOut.filter(
        (r) => /paypal/i.test(r.description || '') && Math.abs(r.totalCents) === 50_000
    );

    // Dup multi-cat
    const groups = new Map<string, typeof sdd>();
    for (const r of sdd) {
        const k = `${dayKey(r.accountingDate)}|${Math.abs(r.totalCents)}`;
        const arr = groups.get(k) || [];
        arr.push(r);
        groups.set(k, arr);
    }
    let dupEuro = 0;
    let dupN = 0;
    for (const arr of groups.values()) {
        const cats = new Set(arr.map((a) => a.category));
        if (arr.length >= 2 && cats.size >= 2) {
            dupN += 1;
            dupEuro += Math.abs(arr[0].totalCents);
        }
    }

    // ── Ferrante CSV ───────────────────────────────────────────────────
    const ferranteNote = {
        csvRows: 'docs/verbali/costi_99_coppie.csv righe 96-97 (G4)',
        riga96:
            '2026-02-23 JSON SHOPPINGARDEN n.2/2026 €20 ↔ MANUAL «Fornitore SDI» n.28 (numero Ferrante sull’allegato mal etichettato)',
        riga97:
            '2026-02-23 JSON FLOWERS DI FERRANTE n.28 €20 ↔ MANUAL SHOPPINGARDEN n.2/2026 €20 — **accoppiamento incrociato vero**',
        percheAssenteDalSample10:
            'Il sample «10 scartate» del dossier analisi era solo inversioni di nome (€372 con doppio verso). Ferrante↔Shoppingarden stava in G4 del CSV, non in quel sample. Dire «assente» era impreciso: assente dal sample inversioni, **presente** nel CSV G4 come falsa coppia fornitori diversi.',
        importo: euro(2000),
        destino: 'fuori Lotto 4 / fuori Lotto 5 — non toccare; due documenti distinti stesso importo',
    };

    // ── L6 DC Studio ───────────────────────────────────────────────────
    const dcManual = await prisma.financialLedgerEntry.findFirst({
        where: {
            reversedAt: null,
            sourceType: 'MANUAL_EXPENSE',
            description: { contains: 'DC STUDIO', mode: 'insensitive' },
        },
        select: { description: true, totalCents: true, accountingDate: true, sourceId: true },
    });
    const dcExpense = dcManual?.sourceId
        ? await prisma.manualFinanceExpense.findUnique({
              where: { id: dcManual.sourceId },
              select: {
                  id: true,
                  totalCents: true,
                  description: true,
                  vendorName: true,
                  expenseDate: true,
                  metadataJson: true,
                  fileName: true,
              },
          })
        : null;

    // IRIN risconto
    const irinDesc =
        'WOSNIC -assistente virtuale IA su website - 12 mesi 558,6+ IVA';
    const irinTotal = 68149;
    const irinStart = new Date('2026-02-18T00:00:00.000Z');
    const irinEnd = new Date('2027-02-17T00:00:00.000Z'); // 12 mesi
    const year2027Start = new Date('2027-01-01T00:00:00.000Z');
    const msDay = 86400000;
    const irinDaysTotal = Math.round((irinEnd.getTime() - irinStart.getTime()) / msDay) + 1;
    const irinDays2027 = Math.max(
        0,
        Math.round((irinEnd.getTime() - year2027Start.getTime()) / msDay) + 1
    );
    const irin2027 = Math.round((irinTotal * irinDays2027) / irinDaysTotal);

    // Aruba hosting/dominio — annual typical
    const aruba = [
        {
            vendor: 'ARUBA SPA',
            date: '2026-04-27',
            cents: 7319,
            desc: 'Pacchetto Hosting Easy Windows — floremoria.eu',
            // hosting annuale tipico Apr 2026 → Apr 2027: quota 2027 ≈ 3.5/12
            start: '2026-04-27',
            months: 12,
            note: 'Hosting annuale (prassi Aruba). Quota 2027 ≈ mesi gen–apr / 12.',
        },
        {
            vendor: 'ARUBA SPA',
            date: '2026-05-03',
            cents: 609,
            desc: 'Dominio con email — floremoria.com',
            start: '2026-05-03',
            months: 12,
            note: 'Dominio annuale tipico.',
        },
        {
            vendor: 'ARUBA SPA',
            date: '2026-04-30',
            cents: 6100,
            desc: 'Ricarica Credito',
            start: '2026-04-30',
            months: null as number | null,
            note: 'Ricarica credito — NON risconto automatico (consumo a scalare).',
        },
    ];

    function quota2027(cents: number, startIso: string, months: number | null) {
        if (!months) return { cents2027: 0, note: 'n/d' };
        const start = new Date(startIso);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + months);
        end.setUTCDate(end.getUTCDate() - 1);
        const totalDays = Math.round((end.getTime() - start.getTime()) / msDay) + 1;
        const y2027 = new Date('2027-01-01T00:00:00.000Z');
        if (end < y2027) return { cents2027: 0, note: 'interamente 2026' };
        const days2027 = Math.round((end.getTime() - y2027.getTime()) / msDay) + 1;
        return {
            cents2027: Math.round((cents * days2027) / totalDays),
            note: `${days2027}/${totalDays} gg in 2027`,
        };
    }

    const arubaRisconti = aruba.map((a) => {
        const q = quota2027(a.cents, a.start, a.months);
        return { ...a, ...q, amount: euro(a.cents), quota2027Euro: euro(q.cents2027) };
    });

    // Other 2025 hints in ledger descriptions
    const desc2025 = await prisma.financialLedgerEntry.findMany({
        where: {
            fiscalYear: 2026,
            reversedAt: null,
            OR: [
                { description: { contains: '2025', mode: 'insensitive' } },
                { description: { contains: 'giu - dic', mode: 'insensitive' } },
                { description: { contains: 'giu-dic', mode: 'insensitive' } },
                { description: { contains: 'capitale sociale', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            sourceType: true,
            description: true,
            totalCents: true,
            accountingDate: true,
            counterpartyName: true,
        },
    });

    const freeze = {
        label: 'FREEZE_UFFICIALE_POST_LOTTO4',
        replaces: 'freeze 2026-09-06 (costi €12.984,96 / RAI −€2.184,71)',
        timestamp: freezeAt,
        batchRef: 'FASE4B_L4_20260907_123006',
        ricavi: {
            ricaviLordiCents: p.ricaviLordiCents,
            ricaviLordiEuro: euro(p.ricaviLordiCents),
            venditeCaratteristicheCents: p.venditeCaratteristicheCents,
            venditeCaratteristicheEuro: euro(p.venditeCaratteristicheCents),
            contributiEsercizioCents: p.contributiEsercizioCents,
            contributiEsercizioEuro: euro(p.contributiEsercizioCents),
            altriRicaviCents: p.altriRicaviCents,
            altriRicaviEuro: euro(p.altriRicaviCents),
            rimborsiCents: p.rimborsiInRicaviCents,
            rimborsiEuro: euro(p.rimborsiInRicaviCents),
        },
        costi: {
            costiTotaliCents: costiTot,
            costiTotaliEuro: euro(costiTot),
            costiFioristiCents: p.costiFioristiCents,
            costiFioristiEuro: euro(p.costiFioristiCents),
            costiFatturePassiveSdiCents: p.costiFatturePassiveSdiCents,
            costiFatturePassiveSdiEuro: euro(p.costiFatturePassiveSdiCents),
            costiSaasCents: p.costiSaasCents,
            costiSaasEuro: euro(p.costiSaasCents),
            costiOperativiCents: p.costiOperativiCents,
            costiOperativiEuro: euro(p.costiOperativiCents),
            oneriBancariCents: p.oneriBancariCents,
            oneriBancariEuro: euro(p.oneriBancariCents),
        },
        risultato: {
            ebitdaCents: p.ebitdaCents,
            ebitdaEuro: euro(p.ebitdaCents),
            risultatoAnteImposteCents: p.risultatoAnteImposteCents,
            risultatoAnteImposteEuro: euro(p.risultatoAnteImposteCents),
        },
        iva: {
            debitoCents: p.ivaDebitoCents,
            debitoEuro: euro(p.ivaDebitoCents),
            creditoCents: p.ivaCreditoCents,
            creditoEuro: euro(p.ivaCreditoCents),
            nettaCents: p.ivaNettaCents,
            nettaEuro: euro(p.ivaNettaCents),
        },
        cassa: {
            saldoBancaFinecoCents: p.cashBankBalanceCents,
            saldoBancaFinecoEuro: euro(p.cashBankBalanceCents),
            cashInflowCents: p.cashInflowCents,
            cashOutflowCents: p.cashOutflowCents,
            cashGatewayTransferCents: p.cashGatewayTransferCents,
        },
        mastro: {
            scrittureAttive2026: active,
            scrittureReversed2026: reversed,
        },
        transitoGateway: transit,
        noteMetodologiche: [
            'Fonte: computeHistoricalPnl({ fiscalYear: 2026 }) + gerarchia fiscale.',
            'Sostituisce il freeze del 6/09. I delta verso quel freeze includono Lotto 2–4 e movimenti live.',
            'RAI live −€5.418,51 (non −€5.692,51 post-L3): drift +€274 già pre-L4.',
        ],
    };

    const chiarimenti = {
        a_lotto5: {
            unicoNumeroMiglioramentoRai: euro(deltaRaiL5),
            raiPre: euro(p.risultatoAnteImposteCents),
            raiPostAttesoSeEsegui: euro(p.risultatoAnteImposteCents + deltaRaiL5),
            spiegazione: [
                `€150 = solo SDD ancora etichettati COSTO_* e visibili in gerarchia (2 righe).`,
                `€1.506,98 = tutti gli SDD unici giorno+importo da riclassificare a funding (perimetro anagrafico).`,
                `Numero vero per il RAI: **${euro(deltaRaiL5)}** = SDD unici che OGGI colpiscono il CE (${euro(costiHit)} costi − ${euro(ricaviHit)} ricavi).`,
                `Di cui: ~€150 etichetta costo + ~€964 etichetta RICAVI_VENDITE ma direzione USCITA → comunque costi operativi nel motore + resto già fuori gerarchia (~€393, no effetto CE).`,
                `Funding €500 Fineco→PayPal del 5/09: ${funding500.map((r) => `${dayKey(r.accountingDate)} ${r.category} ${euro(r.totalCents)}`).join('; ') || 'n/d'} — da includere in L5 come giroconto se ancora SPESE_*.`,
            ],
            dupMultiCat: { n: dupN, euro: euro(dupEuro) },
            sddUniciEuro: euro(uniq.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        },
        b_versioni: {
            conteggio59: 'ricalcolo L4: JSON :v saltate perché la base era già vista nel perimetro costi',
            conteggio84: 'execute L4: tutte le JSON_ENTRY attive fiscalYear 2026 con suffisso :v',
            withBaseSibling: withBase,
            orphansWithoutBase: orphans,
            createdDays,
            stillActive: vActive,
            nuoveCreazioniDopoFase2: false,
            percorsoRogue:
                'ledgerWriteGate blocca sourceKey versionate. L’unico `:v${Date.now()}` nel repo è scripts/fase2-acceptance.ts in dryRun (non scrive). Burst unico 2026-08-21 (84 righe). Nessuna produzione post-cancello rilevata.',
            conclusion:
                '59≠84 per perimetro diverso (collasso-con-base vs tutte le :v, incluse 50 orfane). Non è un leak attivo oggi (0 residue).',
        },
        c_ferrante: ferranteNote,
    };

    const l6 = {
        vincolo: 'SOLA ANALISI — nessuna scrittura — competenza da firmare dal commercialista',
        a_costi2025In2026: {
            dcStudio: {
                numero: '66',
                data: '2026-03-02',
                importo: euro(377430),
                tipoDocumento: 'TD06 Parcella',
                causaleCompleta: dcManual?.description || null,
                proforma: 'n. 158 del 28/01/2026 (anche in causale bonifico Fineco)',
                componentiCausale: [
                    {
                        voce: 'Integrazione nr. 14 fatture estere (giu - dic)',
                        competenzaPresunta: '2025 (giu–dic esercizio precedente)',
                        importoInDb: null,
                        nota: 'Importi riga NON presenti in Neon/metadata — spacchettamento solo da XML/parcella o dal commercialista',
                    },
                    {
                        voce: 'Versamento Capitale Sociale',
                        competenzaPresunta: 'patrimoniale (non costo 2026 né 2025 di esercizio)',
                        importoInDb: null,
                        nota: 'Se è vero versamento capitale → fuori CE; se è consulenza sul versamento → costo. Distinzione del commercialista.',
                    },
                ],
                effettoMaxSeTuttoEstero2025: {
                    euro: euro(377430),
                    raiDa: euro(p.risultatoAnteImposteCents),
                    raiA: euro(p.risultatoAnteImposteCents + 377430),
                    caveat: 'SOLO se l’intera parcella è costo 2025. Con componente capitale l’effetto CE è minore.',
                },
            },
            altriHint2025: desc2025.map((r) => ({
                date: dayKey(r.accountingDate),
                vendor: r.counterpartyName,
                amount: euro(r.totalCents),
                src: r.sourceType,
                desc: (r.description || '').slice(0, 160),
            })),
        },
        b_riscontiAttivi: {
            irin: {
                vendor: 'IRIN S.R.L. / WOSNIC',
                data: '2026-02-18',
                importo: euro(irinTotal),
                durata: '12 mesi',
                inizio: dayKey(irinStart),
                fine: dayKey(irinEnd),
                giorniTotali: irinDaysTotal,
                giorni2027: irinDays2027,
                quotaCompetenza2027: euro(irin2027),
                quotaCompetenza2026: euro(irinTotal - irin2027),
                formula: `${irinDays2027}/${irinDaysTotal} × ${euro(irinTotal)}`,
            },
            aruba: arubaRisconti,
            mensiliRicorrentiEsclusi: [
                'Cursor / Anthropic / Apple / OpenAI / Vercel a consumo o mensili — non risconto annuale (salvo diversa evidenza)',
            ],
        },
        effettoStimatoSu2026: {
            seDcStudioInteraA2025: euro(377430),
            risconti2027Minimi: euro(irin2027 + arubaRisconti.reduce((s, a) => s + a.cents2027, 0)),
            raiPostL4: euro(p.risultatoAnteImposteCents),
            raiSeSoloDc2025: euro(p.risultatoAnteImposteCents + 377430),
            raiSeDc2025PiuRisconti: euro(
                p.risultatoAnteImposteCents +
                    377430 +
                    irin2027 +
                    arubaRisconti.reduce((s, a) => s + a.cents2027, 0)
            ),
            piuEuMaiRegistrati: euro(166702),
            raiSeDc2025PiuEu: euro(p.risultatoAnteImposteCents + 377430 + 166702),
            disclaimer:
                'Stime operative per il commercialista. Nessuna scrittura. La firma sulla competenza è sua.',
        },
    };

    const base = join(process.cwd(), 'docs/verbali');

    // Freeze MD
    const freezeMd = `# FREEZE UFFICIALE — post Lotto 4

**Timestamp:** \`${freezeAt}\`  
**Etichetta:** \`FREEZE_UFFICIALE_POST_LOTTO4\`  
**Sostituisce:** freeze 6 settembre 2026 (costi €12.984,96 · RAI −€2.184,71)  
**Riferimento batch:** \`FASE4B_L4_20260907_123006\`

---

## Conto economico 2026 (motore PnL + gerarchia)

| Voce | Euro | Centesimi |
|------|------|-----------|
| Ricavi lordi | **${euro(p.ricaviLordiCents)}** | ${p.ricaviLordiCents} |
| — Vendite caratteristiche | ${euro(p.venditeCaratteristicheCents)} | ${p.venditeCaratteristicheCents} |
| — Contributi esercizio (CCIAA) | ${euro(p.contributiEsercizioCents)} | ${p.contributiEsercizioCents} |
| — Altri ricavi | ${euro(p.altriRicaviCents)} | ${p.altriRicaviCents} |
| **Costi totali** | **${euro(costiTot)}** | ${costiTot} |
| — Fioristi | ${euro(p.costiFioristiCents)} | ${p.costiFioristiCents} |
| — Fatture passive / manual | ${euro(p.costiFatturePassiveSdiCents)} | ${p.costiFatturePassiveSdiCents} |
| — SaaS | ${euro(p.costiSaasCents)} | ${p.costiSaasCents} |
| — Operativi | ${euro(p.costiOperativiCents)} | ${p.costiOperativiCents} |
| — Oneri bancari | ${euro(p.oneriBancariCents)} | ${p.oneriBancariCents} |
| **EBITDA** | **${euro(p.ebitdaCents)}** | ${p.ebitdaCents} |
| **Risultato ante imposte** | **${euro(p.risultatoAnteImposteCents)}** | ${p.risultatoAnteImposteCents} |

## IVA / Cassa / Mastro

| Voce | Euro |
|------|------|
| IVA a debito | ${euro(p.ivaDebitoCents)} |
| IVA a credito | ${euro(p.ivaCreditoCents)} |
| Saldo banca Fineco | **${euro(p.cashBankBalanceCents)}** |
| Scritture attive 2026 | **${active}** |
| Scritture reversed 2026 | ${reversed} |

Transito gateway: vedi JSON (\`compareGatewayTransitBalances\`).

---

Da questo momento ogni confronto usa **questo** freeze, non quello del 6/09.
`;

    writeFileSync(join(base, 'dossier_fase4b_freeze_post_lotto4.json'), JSON.stringify(freeze, null, 2));
    writeFileSync(join(base, 'dossier_fase4b_freeze_post_lotto4.md'), freezeMd);

    // Chiarimenti + L5 updated
    const l5Md = `# Chiarimenti + Lotto 5 DRY-RUN aggiornato (post freeze)

**Generato:** ${freezeAt}  
**Vincolo:** sola lettura — **nessuna esecuzione Lotto 5**

---

## 1a) Lotto 5 — quanto vale sul RAI?

### Un solo numero: **${euro(deltaRaiL5)}** di miglioramento RAI atteso

| | |
|--|--|
| RAI freeze (pre) | ${euro(p.risultatoAnteImposteCents)} |
| Δ RAI se esegui riclassifica SDD→transito (visibili in CE) | **+${euro(deltaRaiL5)}** |
| RAI post atteso | **${euro(p.risultatoAnteImposteCents + deltaRaiL5)}** |

### Perché non €150 e non €1.506,98

| Cifra | Cosa misura | Utile per il RAI? |
|-------|-------------|-------------------|
| €150 | SDD con etichetta **COSTO_*** ancora in gerarchia | Parziale (sottostima) |
| €1.506,98 | Tutti gli SDD **unici** da portare a funding | Perimetro anagrafico (include già fuori CE) |
| **${euro(deltaRaiL5)}** | SDD unici che **oggi colpiscono il CE** | **Sì — questo è il numero** |

Dettaglio: ${euro(costiHit)} escono dai costi (− ${euro(ricaviHit)} ricavi finti ENTRATA).  
Molti SDD sono etichettati \`RICAVI_VENDITE\` ma sono **USCITA** → il motore li mette nei **costi** comunque (~€964).  
~€393 di SDD unici sono già fuori gerarchia → riclassificarli non muove il RAI.

Dup multi-categoria: ${dupN} · ${euro(dupEuro)} (igiene mastro, effetto CE già incluso o nullo).

**Acceptance L5 (se via):** costi↓ / RAI↑ di ~${euro(deltaRaiL5)}; **banca invariata**.

---

## 1b) \`:v…\` — 59 vs 84

| | |
|--|--|
| 59 | Ricalcolo: versioni **saltate** perché la base era già nel perimetro costi |
| 84 | Execute: **tutte** le JSON \`:v\` attive 2026 |
| Con base gemella | ${withBase} |
| Orfane (solo \`:v\`, senza base) | ${orphans} |
| Create il | **2026-08-21** (burst unico, 84/84) |
| Ancora attive ora | **${vActive}** |
| Nuove dopo Fase 2? | **No** (nessuna post-21/08) |
| Cancello | \`ledgerWriteGate.assertStableSourceKey\` — blocca \`:v\` |
| Unico codice \`:v\` nel repo | \`fase2-acceptance.ts\` **dryRun only** (non scrive) |

---

## 1c) Ferrante ↔ Shoppingarden

Presenti in \`costi_99_coppie.csv\` **righe 96–97** (G4), €20, 2026-02-23:

- JSON Ferrante n.28 ↔ MANUAL Shoppingarden n.2/2026 (incrocio)
- JSON Shoppingarden n.2/2026 ↔ MANUAL «Fornitore SDI» n.28

**Non** erano nel sample «10 scartate» (solo inversioni di nome). Dire «assente» era impreciso sul CSV; era assente da *quel* sample. **Destino: fuori lotto, non toccare.**

---

## STOP Lotto 5

Dry-run aggiornato. **Nessuna esecuzione** senza via esplicita.
`;

    writeFileSync(join(base, 'dossier_fase4b_chiarimenti_l5.json'), JSON.stringify({ chiarimenti, l5: chiarimenti.a_lotto5 }, null, 2));
    writeFileSync(join(base, 'dossier_fase4b_lotto5_dryrun.md'), l5Md);
    writeFileSync(
        join(base, 'dossier_fase4b_lotto5_dryrun.json'),
        JSON.stringify(
            {
                generatedAt: freezeAt,
                deltaRaiUnico: deltaRaiL5,
                deltaRaiEuro: euro(deltaRaiL5),
                raiPre: p.risultatoAnteImposteCents,
                raiPostAtteso: p.risultatoAnteImposteCents + deltaRaiL5,
                costiHit,
                ricaviHit,
                sddUniciEuro: uniq.reduce((s, r) => s + Math.abs(r.totalCents), 0),
                stop: true,
            },
            null,
            2
        )
    );

    // L6 commercialista pack
    const l6Md = `# Lotto 6 — COMPETENZA (solo analisi per commercialista)

**Generato:** ${freezeAt}  
**Vincolo:** nessuna scrittura contabile. La competenza la firma il commercialista.

Freeze di riferimento: \`FREEZE_UFFICIALE_POST_LOTTO4\` · RAI **${euro(p.risultatoAnteImposteCents)}** · costi **${euro(costiTot)}**

---

## A) Costi 2026 che possono appartenere al 2025

### DC STUDIO STP SRL — Fattura / Parcella n. 66 del 02/03/2026 — **€3.774,30**

| Campo | Valore |
|-------|--------|
| Tipo | TD06 Parcella |
| Causale in Contabilità | ${dcManual?.description || '—'} |
| Bonifico Fineco | Pagamento Proforma n. 158 (27/02/2026) |

**Spacchettamento causale (testuale — importi riga NON in DB):**

| Componente | Competenza presunta | Importo |
|------------|---------------------|---------|
| Integrazione nr. 14 fatture estere (giu–dic) | **2025** (esercizio precedente) | *da determinare* |
| Versamento Capitale Sociale | Patrimoniale / fuori CE (o consulenza sul versamento) | *da determinare* |

**Effetto massimo se l’intera parcella fosse costo 2025:** +€3.774,30 sul RAI 2026  
→ RAI da ${euro(p.risultatoAnteImposteCents)} a **${euro(p.risultatoAnteImposteCents + 377430)}**.

Con ricavi \`.eu\` +€1.667,02 (non ancora a libro): **≈ ${euro(p.risultatoAnteImposteCents + 377430 + 166702)}** — la “parità” del socio.  
**Caveat:** senza spacchettamento riga, non possiamo firmare che tutto i €3.774 siano 2025.

### Altri hint 2025 in mastro
${desc2025.length ? desc2025.map((r) => `- ${dayKey(r.accountingDate)} ${r.counterpartyName || ''} ${euro(r.totalCents)} — ${(r.description || '').slice(0, 120)}`).join('\n') : '_nessun altro oltre DC Studio_'}

---

## B) Risconti attivi (quota 2027)

### IRIN / WOSNIC — €681,49 — 12 mesi da 18/02/2026

| | |
|--|--|
| Periodo | ${dayKey(irinStart)} → ${dayKey(irinEnd)} (${irinDaysTotal} gg) |
| Giorni in 2027 | ${irinDays2027} |
| **Quota competenza 2027** | **${euro(irin2027)}** |
| Quota 2026 | ${euro(irinTotal - irin2027)} |

### Aruba

| Data | Voce | Importo | Quota 2027 stimata | Nota |
|------|------|---------|-------------------|------|
${arubaRisconti.map((a) => `| ${a.date} | ${a.desc} | ${a.amount} | **${a.quota2027Euro}** | ${a.note} |`).join('\n')}

### Esclusi (mensili / a consumo)
Cursor, Anthropic, Apple, OpenAI, Vercel ricorrenti — non trattati come abbonamento annuale.

---

## Effetto stimato sul risultato 2026 (ordine di grandezza)

| Scenario | RAI risultante |
|----------|----------------|
| Freeze attuale | ${euro(p.risultatoAnteImposteCents)} |
| + DC Studio intera a 2025 | ${euro(p.risultatoAnteImposteCents + 377430)} |
| + DC 2025 + risconti 2027 (IRIN+Aruba hosting/dominio) | ${euro(p.risultatoAnteImposteCents + 377430 + irin2027 + arubaRisconti.reduce((s, a) => s + a.cents2027, 0))} |
| + DC 2025 + ricavi .eu €1.667,02 | **${euro(p.risultatoAnteImposteCents + 377430 + 166702)}** |

**Domanda al commercialista:** spacchettare la parcella 66 (estere 2025 vs capitale) e confermare i risconti.

---

## Isabella (promemoria operativo)

11 consegne pagate · 3 fatte · 1 il **12/09/2026** · **7 ancora da fare**.
`;

    writeFileSync(join(base, 'dossier_fase4b_lotto6_competenza.json'), JSON.stringify(l6, null, 2));
    writeFileSync(join(base, 'dossier_fase4b_lotto6_competenza.md'), l6Md);

    // Update coppie false file for Ferrante
    const scartiPath = join(base, 'dossier_fase4b_coppie_false_scartate.md');
    if (existsSync(scartiPath)) {
        let cur = readFileSync(scartiPath, 'utf8');
        if (!cur.includes('Ferrante ↔ Shoppingarden (CSV 96-97)')) {
            cur += `

## a-bis) Ferrante ↔ Shoppingarden (CSV 96-97) — fornitori diversi

| Data | JSON | MANUAL | Importo |
|------|------|--------|---------|
| 2026-02-23 | FLOWERS DI FERRANTE n.28 | SHOPPINGARDEN n.2/2026 | €20,00 |
| 2026-02-23 | SHOPPINGARDEN n.2/2026 | Fornitore SDI n.28 | €20,00 |

**Fuori lotto.** Non erano nel sample «10 inversioni»; erano in G4 del CSV. Correzione: non «assenti», ma in altra lista.
`;
            writeFileSync(scartiPath, cur);
        }
    }

    console.log(
        JSON.stringify(
            {
                freezeAt,
                rai: euro(p.risultatoAnteImposteCents),
                costi: euro(costiTot),
                l5DeltaRai: euro(deltaRaiL5),
                vActive,
                irin2027: euro(irin2027),
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
