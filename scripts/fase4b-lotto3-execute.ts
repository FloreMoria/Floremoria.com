/**
 * Misura A: RICAVI_VENDITE 2026 positivi vs negativi (sola lettura / parte di lotto3).
 * + Lotto 3 execute.
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
import {
    ACCOUNT_BANCA_FINECO,
    ACCOUNT_BANCA_CO_STRIPE,
    ACCOUNT_BANCA_CO_PAYPAL,
} from '../lib/financial/chartOfAccounts';

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function batchIdNow(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `FASE4B_L3_${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function day(d: Date | null | undefined) {
    return d ? d.toISOString().slice(0, 10) : '';
}
function daysBetween(a: string, b: Date) {
    return Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(day(b) + 'T12:00:00Z')) / 86400000;
}

const EU_LIST = `
2026-08-21;Oreste Poverello;89.99
2026-08-17;Amanda Favot;109.98
2026-08-10;Edy, Lori and Dana Moras;69.99
2026-08-06;Daniela Barilari;39.99
2026-08-01;valentina cecchini;29.99
2026-07-16;Filomena Maiorano;37.99
2026-07-09;Giulio Rosace;39.99
2026-07-03;(senza nome);69.99
2026-07-02;Nicolato Francesco;104.98
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
2026-01-20;(senza nome);39.99
2026-01-16;Giulia Grappone;39.99
`
    .trim()
    .split('\n')
    .map((l) => {
        const [date, customer, amount] = l.split(';');
        return { date, customer, cents: Math.round(parseFloat(amount) * 100) };
    });

const MISSING_34 = new Set([
    '2026-08-17|Amanda Favot|10998',
    '2026-06-16|Rosetta Paladino|4946',
    '2026-06-05|cyrille magali Maman-Sernaglia|8999',
    '2026-05-25|Petra Manakova|8498',
    '2026-05-16|Maria Puliafico|4999',
    '2026-05-03|Maria ANTONIA Pozzi|5348',
    '2026-05-03|Isabella Cesaroni|29990',
    '2026-04-29|Rosetta Paladino|4597',
    '2026-04-28|Silvia Tregnaghi|5498',
    '2026-04-27|Famiglia Deotti-Buzzi|3999',
    '2026-04-20|LUCIANO MAMMI\'|5998',
    '2026-04-20|Elena Lombardi|3999',
    '2026-04-16|Rosaria Di Pasquale|2999',
    '2026-04-01|Cristiano Mariani|2999',
    '2026-03-31|FRANCESCO REDIVO|14498',
    '2026-03-29|Agostino Buttignol|2999',
    '2026-03-24|LUCIANO MAMMI\'|2999',
    '2026-03-22|LUCIANO MAMMI\'|2999',
    '2026-03-19|Silvia Tregnaghi|3499',
    '2026-03-18|L\'alternativa srl|3999',
    '2026-03-14|Chiara Durì|7248',
    '2026-03-14|Rosetta Paladino|6998',
    '2026-03-13|Maria Puliafico|4999',
    '2026-03-01|Mimma Congedo|14498',
    '2026-02-26|Norm Marchi|3999',
    '2026-02-25|Moreno Venturino|2999',
    '2026-02-22|LUCIANO MAMMI\'|2999',
    '2026-02-19|Luigina Dereani|3999',
    '2026-02-16|LUCIANO MAMMI\'|2999',
    '2026-02-10|Ester Irace|3999',
    '2026-01-22|Luciano Mammì|2999',
    '2026-01-22|Rosetta Paladino|4097',
    '2026-01-21|Luciano Mammì|2999',
    '2026-01-16|Giulia Grappone|3999',
]);

async function measureA() {
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: { not: 'CUSTOMER_RECEIPT' },
            category: 'RICAVI_VENDITE',
        },
        select: {
            id: true,
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
            category: true,
        },
    });

    // Same filters as PnL before category loop (hierarchy + pose) — replicate via hierarchy on all FY rows then filter
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
    const ricavi = usable.filter((r) => r.category === 'RICAVI_VENDITE');

    let pos = 0;
    let neg = 0;
    let posN = 0;
    let negN = 0;
    for (const r of ricavi) {
        if (r.totalCents > 0 || (r.direction === 'ENTRATA' && r.totalCents !== 0)) {
            // PnL uses: direction ENTRATA || totalCents > 0 for revenue branch
            if (r.direction === 'ENTRATA' || r.totalCents > 0) {
                if (r.totalCents < 0) {
                    // shouldn't happen often
                    neg += Math.abs(r.totalCents);
                    negN++;
                } else {
                    pos += Math.abs(r.totalCents);
                    posN++;
                }
            } else {
                neg += Math.abs(r.totalCents);
                negN++;
            }
        } else {
            neg += Math.abs(r.totalCents);
            negN++;
        }
    }

    // Cleaner split purely by sign of totalCents among RICAVI_VENDITE in hierarchy
    let posSign = 0;
    let negSign = 0;
    let posSignN = 0;
    let negSignN = 0;
    let zeroN = 0;
    for (const r of ricavi) {
        if (r.totalCents > 0) {
            posSign += r.totalCents;
            posSignN++;
        } else if (r.totalCents < 0) {
            negSign += r.totalCents; // keep negative
            negSignN++;
        } else zeroN++;
    }

    // What PnL actually counts as vendite: ENTRATA || total>0
    let pnlStyle = 0;
    let pnlStyleN = 0;
    let costSideNeg = 0;
    let costSideNegN = 0;
    for (const r of ricavi) {
        if (r.direction === 'ENTRATA' || r.totalCents > 0) {
            pnlStyle += Math.abs(r.totalCents);
            pnlStyleN++;
        } else {
            costSideNeg += Math.abs(r.totalCents);
            costSideNegN++;
        }
    }

    return {
        venditeCaratteristicheCents: pnl.venditeCaratteristicheCents ?? 0,
        venditeCaratteristiche: euro(pnl.venditeCaratteristicheCents ?? 0),
        bySign: {
            positivi: { n: posSignN, euro: euro(posSign), cents: posSign },
            negativi: { n: negSignN, euro: euro(negSign), cents: negSign },
            zeroN,
            sommaAlgebrica: euro(posSign + negSign),
            sommaAlgebricaCents: posSign + negSign,
        },
        pnlBranch: {
            countedAsRicavi_ENTRATAorPos: { n: pnlStyleN, euro: euro(pnlStyle), cents: pnlStyle },
            countedAsCosti_USCITAneg: { n: costSideNegN, euro: euro(costSideNeg), cents: costSideNeg },
        },
        rawCategoryCount: rows.length,
        hierarchyRicaviVenditeCount: ricavi.length,
    };
}

async function measureB() {
    const stripeEu = await prisma.stripeFinanceMovement.findMany({
        where: { stripeId: { startsWith: 'stripe_eu_' }, type: 'charge' },
        select: { amountCents: true, createdAtStripe: true, feeCents: true, netCents: true },
    });
    const pp = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: { totalCents: true, accountingDate: true },
    });

    const usedSt = new Set<number>();
    const usedPp = new Set<number>();
    const pairs: Array<{
        date: string;
        customer: string;
        listCents: number;
        collectedCents: number;
        delta: number;
        channel: string;
    }> = [];

    for (const o of EU_LIST) {
        let collected: number | null = null;
        let channel = '';
        // Isabella special
        if (o.customer === 'Isabella Cesaroni' && o.cents === 29990) {
            const hit = stripeEu.findIndex(
                (m, i) =>
                    !usedSt.has(i) &&
                    Math.abs(m.amountCents - 28490) < 1 &&
                    daysBetween(o.date, m.createdAtStripe) <= 1
            );
            if (hit >= 0) {
                usedSt.add(hit);
                collected = stripeEu[hit].amountCents;
                channel = 'Stripe EU';
            }
        }
        if (collected == null) {
            let si = -1;
            let best = 99;
            stripeEu.forEach((m, i) => {
                if (usedSt.has(i)) return;
                if (Math.abs(m.amountCents - o.cents) > 1) return;
                const dd = daysBetween(o.date, m.createdAtStripe);
                if (dd <= 5 && dd < best) {
                    best = dd;
                    si = i;
                }
            });
            if (si >= 0) {
                usedSt.add(si);
                collected = stripeEu[si].amountCents;
                channel = 'Stripe EU';
            }
        }
        if (collected == null) {
            let pi = -1;
            let best = 99;
            pp.forEach((p, i) => {
                if (usedPp.has(i)) return;
                if (Math.abs(p.totalCents - o.cents) > 1) return;
                const dd = daysBetween(o.date, p.accountingDate);
                if (dd <= 5 && dd < best) {
                    best = dd;
                    pi = i;
                }
            });
            if (pi >= 0) {
                usedPp.add(pi);
                collected = pp[pi].totalCents;
                channel = 'PayPal';
            }
        }
        if (collected != null) {
            pairs.push({
                date: o.date,
                customer: o.customer,
                listCents: o.cents,
                collectedCents: collected,
                delta: o.cents - collected,
                channel,
            });
        }
    }

    const withDelta = pairs.filter((p) => p.delta !== 0);
    const deltaTotal = withDelta.reduce((s, p) => s + p.delta, 0);
    const listSumMatched = pairs.reduce((s, p) => s + p.listCents, 0);
    const collectedSumMatched = pairs.reduce((s, p) => s + p.collectedCents, 0);

    // Recalc .eu totals on collected for ALL 43 where matched; unmatched keep list
    let euRecalc = 0;
    let euRecalcMissing34 = 0;
    const matchedKeys = new Set(pairs.map((p) => `${p.date}|${p.customer}|${p.listCents}`));
    for (const o of EU_LIST) {
        const key = `${o.date}|${o.customer}|${o.cents}`;
        const pair = pairs.find(
            (p) => p.date === o.date && p.customer === o.customer && p.listCents === o.cents
        );
        const use = pair ? pair.collectedCents : o.cents;
        euRecalc += use;
        const missKey = `${o.date}|${o.customer}|${o.cents}`;
        if (MISSING_34.has(missKey)) {
            euRecalcMissing34 += pair ? pair.collectedCents : o.cents;
        }
    }

    // Isabella adjustment on missing 34: if using collected
    const missing34List = 203691;
    const amanda = 10998;
    const missing34NoAmanda = missing34List - amanda;

    function iva10(gross: number) {
        const abs = Math.abs(gross);
        const imp = Math.round(abs / 1.1);
        return abs - imp;
    }

    return {
        matchedN: pairs.length,
        withDeltaN: withDelta.length,
        deltaTotal: euro(deltaTotal),
        deltaTotalCents: deltaTotal,
        deltas: withDelta.map((p) => ({
            ...p,
            list: euro(p.listCents),
            collected: euro(p.collectedCents),
            deltaEuro: euro(p.delta),
        })),
        matchedListSum: euro(listSumMatched),
        matchedCollectedSum: euro(collectedSumMatched),
        eu43List: euro(EU_LIST.reduce((s, o) => s + o.cents, 0)),
        eu43OnCollectedWhereMatchedElseList: euro(euRecalc),
        missing34List: euro(missing34List),
        missing34OnCollectedBasis: euro(euRecalcMissing34),
        ivaMissing34List: euro(iva10(missing34List)),
        ivaMissing34Collected: euro(iva10(euRecalcMissing34)),
        amandaScenarios: {
            valid: { euMissing: euro(missing34List), iva: euro(iva10(missing34List)) },
            unpaid: {
                euMissing: euro(missing34NoAmanda),
                iva: euro(iva10(missing34NoAmanda)),
            },
            titolare: 'fiore consegnato → scenario valido',
        },
    };
}

async function executeLotto3(batchId: string) {
    const SNAPSHOT = {
        at: '2026-09-06T21:53:19.251Z',
        vendite: 573632,
        rai: -268471,
        expectedVendite: 272852,
    };

    const revenueBank = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'BANK_LINE',
            category: { in: ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI'] },
        },
        select: {
            id: true,
            totalCents: true,
            category: true,
            bankLineId: true,
            sourceId: true,
            description: true,
            metadataJson: true,
        },
    });

    const targets: typeof revenueBank = [];
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
        targets.push(r);
    }

    if (targets.length !== 87) {
        throw new Error(`Expected 87 targets, got ${targets.length}`);
    }
    const sum = targets.reduce((s, t) => s + Math.abs(t.totalCents), 0);
    if (sum !== 408029) {
        throw new Error(`Expected 408029 cents, got ${sum}`);
    }

    const executedAt = new Date().toISOString();
    let n = 0;
    for (const t of targets) {
        const prev =
            t.metadataJson && typeof t.metadataJson === 'object' && !Array.isArray(t.metadataJson)
                ? (t.metadataJson as Record<string, unknown>)
                : {};
        const desc = (t.description || '').toUpperCase();
        const isPaypal = /PAYPAL/.test(desc);
        const gateway = isPaypal ? ACCOUNT_BANCA_CO_PAYPAL : ACCOUNT_BANCA_CO_STRIPE;
        await prisma.financialLedgerEntry.update({
            where: { id: t.id },
            data: {
                category: 'TRASFERIMENTO_INTERNO',
                entryNature: 'TRANSITO',
                metadataJson: {
                    ...prev,
                    dareAccount: ACCOUNT_BANCA_FINECO,
                    avereAccount: gateway,
                    fase4bBatchId: batchId,
                    fase4bLotto: 3,
                    fase4bAction: 'RECLASS',
                    fase4bPrevCategory: t.category,
                    fase4bPrevAvereAccount: prev.avereAccount ?? null,
                    fase4bExecutedAt: executedAt,
                },
            },
        });
        n++;
    }

    const pnlAfter = await computeHistoricalPnl({ fiscalYear: 2026 });
    return {
        batchId,
        rowsTouched: n,
        snapshotRef: SNAPSHOT,
        post: {
            vendite: pnlAfter.venditeCaratteristicheCents ?? 0,
            venditeEuro: euro(pnlAfter.venditeCaratteristicheCents ?? 0),
            rai: pnlAfter.risultatoAnteImposteCents,
            raiEuro: euro(pnlAfter.risultatoAnteImposteCents),
            ricaviLordi: euro(pnlAfter.ricaviLordiCents),
            altri: euro(pnlAfter.altriRicaviCents ?? 0),
            contributi: euro(pnlAfter.contributiEsercizioCents ?? 0),
        },
        okVendite: (pnlAfter.venditeCaratteristicheCents ?? 0) === SNAPSHOT.expectedVendite,
    };
}

async function main() {
    console.log('=== A ===');
    const a = await measureA();
    console.log(JSON.stringify(a, null, 2));

    console.log('=== B+C ===');
    const b = await measureB();
    console.log(JSON.stringify(b, null, 2));

    const batchId = batchIdNow();
    console.log('=== D EXECUTE', batchId, '===');
    const d = await executeLotto3(batchId);
    console.log(JSON.stringify(d, null, 2));

    const conclusA =
        Math.abs(a.bySign.negativi.cents) > 100000
            ? 'NEGATIVI_DENTRO_SEGNO_MA_VEDI_PNL_BRANCH'
            : Math.abs(a.pnlBranch.countedAsCosti_USCITAneg.cents - 162304) < 5000
              ? 'NEGATIVI_ESISTONO_MA_FUORI_DAL_RAMO_RICAVI_PNL'
              : 'CHECK';

    const md = `# Fase 4b — Lotto 3 ESEGUITO + misure A/B/C

**batch_id:** \`${batchId}\`  
**Eseguito:** ${new Date().toISOString()}  
**Snapshot dry-run di riferimento:** \`2026-09-06T21:53:19.251Z\`

---

## D — Lotto 3 esecuzione

| | |
|--|--|
| Righe toccate | **${d.rowsTouched}** |
| Azione | RECLASS → \`TRASFERIMENTO_INTERNO\` |
| Vendite caratteristiche **post** | **${d.post.venditeEuro}** (atteso €2.728,52) |
| Risultato ante imposte **post** | ${d.post.raiEuro} |
| Ricavi lordi post | ${d.post.ricaviLordi} |
| Match atteso vendite | ${d.okVendite ? 'SÌ' : 'NO'} |

**Vendite .com post-Lotto 3 = ${d.post.venditeEuro}. Totale complessivo vendite in verifica** (non dichiarato finale).

---

## A — Misura RICAVI_VENDITE 2026 (post-gerarchia, pre-interpretazione)

| | N | Euro |
|--|---|------|
| Importi **positivi** (\`totalCents > 0\`) | ${a.bySign.positivi.n} | ${a.bySign.positivi.euro} |
| Importi **negativi** (\`totalCents < 0\`) | ${a.bySign.negativi.n} | ${a.bySign.negativi.euro} |
| Somma algebrica | | ${a.bySign.sommaAlgebrica} |
| \`venditeCaratteristicheCents\` motore (pre-L3 al momento misura A, se post-L3 ricalcolare) | | vedi post D |

### Come il motore le tratta

| Ramo | N | Euro |
|------|---|------|
| Contate come ricavi (\`ENTRATA\` o \`totalCents > 0\`) | ${a.pnlBranch.countedAsRicavi_ENTRATAorPos.n} | ${a.pnlBranch.countedAsRicavi_ENTRATAorPos.euro} |
| Contate come costi (\`USCITA\` e non positive) | ${a.pnlBranch.countedAsCosti_USCITAneg.n} | ${a.pnlBranch.countedAsCosti_USCITAneg.euro} |

**Conclusione numerica:** i negativi \`RICAVI_VENDITE\` ammontano a **${a.bySign.negativi.euro}** (n=${a.bySign.negativi.n}).  
Nel motore PnL quella quota sta nel ramo **costi** (${a.pnlBranch.countedAsCosti_USCITAneg.euro}), non nel ramo che forma \`venditeCaratteristicheCents\`.  
Quindi **non deprimono** il totale vendite caratteristiche del motore; correggerle **non alza** \`venditeCaratteristicheCents\` di €1.623 (alza solo l’etichetta/costi esposti).  
Codice conclusione: \`${conclusA}\`.

---

## B — Ordine lista vs incasso (ordini .eu abbinati)

| | |
|--|--|
| Ordini abbinati Stripe/PayPal | ${b.matchedN} |
| Con delta listino ≠ incasso | ${b.withDeltaN} |
| Delta totale (lista − incassato) | ${b.deltaTotal} |
| Somma lista abbinati | ${b.matchedListSum} |
| Somma incassato abbinati | ${b.matchedCollectedSum} |
| Totale .eu 43 su base incassi (unmatched=lista) | ${b.eu43OnCollectedWhereMatchedElseList} |
| 34 mancanti su base lista | ${b.missing34List} |
| 34 mancanti su base incassi dove abbinati | ${b.missing34OnCollectedBasis} |
| IVA 10% teorica 34 (lista) | ${b.ivaMissing34List} |
| IVA 10% teorica 34 (incassi) | ${b.ivaMissing34Collected} |

Deltas: ${JSON.stringify(b.deltas)}

---

## C — Amanda

Titolare: **fiore consegnato** → scenario ordine valido.  
DB: nessun \`Order\` Amanda €109,98; nessuno stato ANNULLATO/NON PAGATO recuperabile qui.

| Scenario | .eu mancanti (34) | IVA 10% teorica |
|----------|-------------------|-----------------|
| Ordine valido (confermato) | ${b.amandaScenarios.valid.euMissing} | ${b.amandaScenarios.valid.iva} |
| Se non pagato (controfattuale) | ${b.amandaScenarios.unpaid.euMissing} | ${b.amandaScenarios.unpaid.iva} |

---

## STOP
`;

    fs.writeFileSync(
        path.join(process.cwd(), 'docs/verbali/dossier_fase4b_lotto3_eseguito.md'),
        md,
        'utf8'
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
