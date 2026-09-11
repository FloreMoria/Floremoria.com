/**
 * Per la Δ €488: verifica se le TX PayPal «solo motore» sono nei corrispettivi
 * (fonte IVA a debito dossier) e stima IVA per trimestre.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';

const EXACT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-com-488-exact.json');
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-punto7-com-488.md');
const OUTJ = path.join(process.cwd(), 'docs/verbali/11-09-2026-punto7-com-488.json');

function euro(c: number) {
  return Math.round(c) / 100;
}

async function main() {
  const exact = JSON.parse(fs.readFileSync(EXACT, 'utf8'));
  const notInLista = exact.notInLista.rows as {
    date: string;
    q: number;
    euro: number;
    sourceKey: string;
    description: string;
    vatLedgerEuro: number;
  }[];

  const start = new Date('2026-01-01T00:00:00.000Z');
  const end = new Date('2026-12-31T23:59:59.999Z');
  const gw = await buildGatewayCorrispettivi({ start, end });

  const txIdFromKey = (sk: string) => sk.replace(/^PAYPAL_TX:/, '').replace(/^STRIPE_TX:/, '');
  const corrByTx = new Map(gw.rows.map((r) => [r.transactionId, r]));

  const classified = notInLista.map((r) => {
    const tx = txIdFromKey(r.sourceKey);
    const c = corrByTx.get(tx);
    const kind = /Checkout|Acquisto Floremoria|Ordine FloreMoria/i.test(r.description)
      ? 'checkout_orfano'
      : /cashback/i.test(r.description)
        ? 'cashback'
        : /BALLARATE|POSTE|ORCHIDEA|MASPES|TRANSATEL|UBIGI|FACEBK|FLOREMORIA S\.R\.L/i.test(
            r.description
          )
        ? 'non_vendita'
        : 'altro';
    return {
      ...r,
      tx,
      inCorrispettivi: !!c,
      corrOrderNumber: c?.orderNumber || null,
      corrGross: c ? euro(c.grossCents) : 0,
      corrIva: c ? euro(c.ivaCents) : 0,
      corrVatRate: c?.vatRate ?? null,
      corrCertainty: c?.vatCertainty || null,
      kind,
    };
  });

  // Economic net explanation
  const uncovered = exact.matched.uncoveredLista as { id: string; euro: number; q: number; date: string }[];

  // Pair Mammì-like: uncovered FT- with same date+amount as checkout orphans
  const pairs: any[] = [];
  const usedCorr = new Set<string>();
  for (const u of uncovered) {
    const hits = classified.filter(
      (r) =>
        !usedCorr.has(r.sourceKey) &&
        r.kind === 'checkout_orfano' &&
        r.date === u.date &&
        Math.abs(r.euro - u.euro) < 0.02
    );
    if (hits.length) {
      const h = hits[0]!;
      usedCorr.add(h.sourceKey);
      pairs.push({ listaId: u.id, listaEuro: u.euro, q: u.q, date: u.date, paypal: h.sourceKey, paypalEuro: h.euro });
    }
  }

  const checkout = classified.filter((r) => r.kind === 'checkout_orfano');
  const checkoutPaired = checkout.filter((r) => usedCorr.has(r.sourceKey));
  const checkoutUnpaired = checkout.filter((r) => !usedCorr.has(r.sourceKey));
  const noise = classified.filter((r) => r.kind !== 'checkout_orfano');

  // IVA in corrispettivi on motore-only rows
  const ivaOnNotInLista = classified
    .filter((r) => r.inCorrispettivi)
    .reduce((s, r) => s + r.corrIva, 0);

  // By quarter: IVA on checkout unpaired (likely .eu double risk) + noise sales in corr
  const riskRows = [...checkoutUnpaired, ...noise.filter((r) => r.kind === 'altro' || r.euro >= 20)];
  const byQ: Record<string, any> = {};
  for (const r of classified) {
    const k = `T${r.q}`;
    byQ[k] = byQ[k] || {
      motoreOnlyEuro: 0,
      motoreOnlyN: 0,
      ivaCorrEuro: 0,
      checkoutUnpairedEuro: 0,
      checkoutUnpairedIvaCorr: 0,
      noiseEuro: 0,
      noiseIvaCorr: 0,
      pairedWithListaComEuro: 0,
    };
    byQ[k].motoreOnlyEuro += r.euro;
    byQ[k].motoreOnlyN += 1;
    byQ[k].ivaCorrEuro += r.corrIva;
    if (r.kind === 'checkout_orfano' && !usedCorr.has(r.sourceKey)) {
      byQ[k].checkoutUnpairedEuro += r.euro;
      byQ[k].checkoutUnpairedIvaCorr += r.corrIva;
    }
    if (r.kind !== 'checkout_orfano') {
      byQ[k].noiseEuro += r.euro;
      byQ[k].noiseIvaCorr += r.corrIva;
    }
    if (usedCorr.has(r.sourceKey)) byQ[k].pairedWithListaComEuro += r.euro;
  }
  for (const v of Object.values(byQ)) {
    for (const key of Object.keys(v)) {
      if (typeof v[key] === 'number' && key !== 'motoreOnlyN') v[key] = Math.round(v[key] * 100) / 100;
    }
  }

  // IVA from corrispettivi by quarter (same source as dossier liquidazione)
  const corrByQ: Record<string, { lordo: number; iva: number; n: number }> = {
    T1: { lordo: 0, iva: 0, n: 0 },
    T2: { lordo: 0, iva: 0, n: 0 },
    T3: { lordo: 0, iva: 0, n: 0 },
    T4: { lordo: 0, iva: 0, n: 0 },
  };
  for (const r of gw.rows) {
    const q = Math.floor(new Date(r.date).getUTCMonth() / 3) + 1;
    const k = `T${q}`;
    if (!corrByQ[k]) continue;
    corrByQ[k].lordo += euro(r.grossCents);
    corrByQ[k].iva += euro(r.ivaCents);
    corrByQ[k].n += 1;
  }
  for (const v of Object.values(corrByQ)) {
    v.lordo = Math.round(v.lordo * 100) / 100;
    v.iva = Math.round(v.iva * 100) / 100;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    verdetto: {
      listaComCorretta: true,
      motoreFreeze2919: exact.rebuild.postEuro,
      listaCom: exact.listaCom.euro,
      deltaNetto: 488.33,
      formula:
        'Δ = (PayPal solo-motore €1.215,49) − (FT-/FF- in lista non nel freeze €727,16) = €488,33',
    },
    motoreOnly: {
      n: classified.length,
      euro: Math.round(classified.reduce((s, r) => s + r.euro, 0) * 100) / 100,
      inCorrispettiviN: classified.filter((r) => r.inCorrispettivi).length,
      ivaCorrEuro: Math.round(ivaOnNotInLista * 100) / 100,
      checkout: {
        n: checkout.length,
        euro: Math.round(checkout.reduce((s, r) => s + r.euro, 0) * 100) / 100,
        pairedSameSaleAsListaCom: {
          n: pairs.length,
          euro: Math.round(pairs.reduce((s, p) => s + p.paypalEuro, 0) * 100) / 100,
          pairs,
        },
        unpairedLikelyEuOrExtra: {
          n: checkoutUnpaired.length,
          euro: Math.round(checkoutUnpaired.reduce((s, r) => s + r.euro, 0) * 100) / 100,
          ivaCorr: Math.round(checkoutUnpaired.reduce((s, r) => s + r.corrIva, 0) * 100) / 100,
          rows: checkoutUnpaired,
        },
      },
      noise: {
        n: noise.length,
        euro: Math.round(noise.reduce((s, r) => s + r.euro, 0) * 100) / 100,
        ivaCorr: Math.round(noise.reduce((s, r) => s + r.corrIva, 0) * 100) / 100,
        rows: noise.filter((r) => r.euro >= 1),
      },
    },
    listaOnlyUncovered: uncovered,
    byQ,
    corrispettiviByQ: corrByQ,
    ivaConclusion: {
      ledgerVatOnDeltaRows: 0,
      note:
        'L’IVA a debito del dossier nasce dai corrispettivi gateway, non dal PnL «vendite caratteristiche». La Δ €488 è un gap di etichetta commerciale (motore vs lista .com), non una liquidazione IVA separata. Rischio IVA in eccesso solo se le stesse TX PayPal orfane sono nei corrispettivi CON IVA e contemporaneamente l’ordine .eu/.com è già coperto da un altro incasso — da verificare sulle unpaired.',
    },
  };

  // Markdown for user
  const md = `# Punto 7 — Δ €488,33 vendite .com (lista vs motore)

**Data:** 2026-09-11  
**Confronto:** lista ordini .com **€2.431,66** vs motore freeze post-L3 **€2.919,99** → **Δ €488,33**

## Verdetto

La **lista ordini è il dato commerciale corretto** per il .com.  
Il motore €2.919,99 era l’etichetta storica «vendite caratteristiche / .com post-L3», non un filtro FT-/FF-.

### Formula della differenza

| Blocco | € |
|--------|--:|
| Motore conta, lista .com no (51 PayPal in freeze) | **1.215,49** |
| Lista .com sì, motore freeze no (14 FT-/FF-) | **727,16** |
| **Netto = Δ** | **488,33** |

## Righe che il motore conta e la lista .com no

Tutte **PayPal** (\`RICAVI_VENDITE\` nel freeze post-L3), senza \`orderId\` collegato a FT-/FF-.

### A) Checkout orfani abbinabili 1:1 a FT- già in lista (stessa vendita, doppia rappresentazione)

Queste TX sono «solo motore» come riga ledger, ma economicamente sono i pagamenti degli ordini lista sotto (quindi **non** sono ricavi .com in più rispetto alla lista — sono lo stesso fatto).

${pairs
  .map(
    (p) =>
      `- ${p.date} T${p.q}: PayPal €${p.paypalEuro.toFixed(2)} ↔ lista **${p.listaId}** €${p.listaEuro.toFixed(2)}`
  )
  .join('\n')}

### B) Checkout orfani non abbinati a FT-/FF- (spesso = vendite .eu della lista)

${checkoutUnpaired
  .map(
    (r) =>
      `- T${r.q} ${r.date} €${r.euro.toFixed(2)} · ${r.description.slice(0, 70)} · corr=${r.inCorrispettivi ? `IVA €${r.corrIva.toFixed(2)} (${r.corrCertainty})` : 'no'}`
  )
  .join('\n')}

### C) Rumore / non vendita (SaaS, fornitori, cashback) ancora in RICAVI_VENDITE

${noise
  .filter((r) => r.euro >= 1)
  .map(
    (r) =>
      `- T${r.q} ${r.date} €${r.euro.toFixed(2)} · ${r.description.slice(0, 70)} · corr IVA €${r.corrIva.toFixed(2)}`
  )
  .join('\n')}

## Lista .com non presente nel freeze motore (€727,16)

${uncovered.map((u) => `- T${u.q} ${u.date} **${u.id}** €${u.euro.toFixed(2)}`).join('\n')}

*(Isabella carnet FT-MC-26-007 €284,90 + pose Mammì FT-PA/FT-CS a €31,48 già coperte dai PayPal in A.)*

## IVA a debito — per trimestre

| Trim | Motore-only € | Di cui IVA in corrispettivi sulle stesse TX | Checkout unpaired € | IVA corr su unpaired |
|------|-------------:|------------------------------------------:|--------------------:|---------------------:|
| T1 | ${byQ.T1?.motoreOnlyEuro ?? 0} | ${byQ.T1?.ivaCorrEuro ?? 0} | ${byQ.T1?.checkoutUnpairedEuro ?? 0} | ${byQ.T1?.checkoutUnpairedIvaCorr ?? 0} |
| T2 | ${byQ.T2?.motoreOnlyEuro ?? 0} | ${byQ.T2?.ivaCorrEuro ?? 0} | ${byQ.T2?.checkoutUnpairedEuro ?? 0} | ${byQ.T2?.checkoutUnpairedIvaCorr ?? 0} |
| T3 | ${byQ.T3?.motoreOnlyEuro ?? 0} | ${byQ.T3?.ivaCorrEuro ?? 0} | ${byQ.T3?.checkoutUnpairedEuro ?? 0} | ${byQ.T3?.checkoutUnpairedIvaCorr ?? 0} |

**Sul ledger PnL:** \`vatCents=0\` su tutte queste righe → la Δ €488 **non** ha generato IVA a debito dentro il motore vendite.

**Sul dossier:** l’IVA a debito esce dai **corrispettivi gateway**.  
- Se un checkout orfano è nei corrispettivi **e** l’ordine .eu correlato è già coperto dallo stesso incasso → **non** è IVA doppia, è la stessa riga.  
- Rischio IVA in eccesso: solo rumore classificato come vendita nei corrispettivi (Ballarate, Maspes, Ubigi, ecc.) o checkout senza ordine ma con IVA 10%.

Dettaglio corrispettivi gateway 2026 (fonte IVA a debito dossier):
${Object.entries(corrByQ)
  .filter(([k]) => k !== 'T4' || corrByQ.T4.n > 0)
  .map(([k, v]) => `- **${k}**: lordo €${v.lordo} · IVA €${v.iva} (${v.n} righe)`)
  .join('\n')}

## Conclusione operativa

1. Usa **lista .com €2.431,66** (e fatturato ufficiale €4.098,68) come verità commerciale.
2. Il motore €2.919,99 mescolava PayPal orfani (.eu + rumore + TX già in lista come FT-) sotto «vendite .com».
3. La Δ €488 **non** implica di per sé IVA a debito dichiarata in eccesso sul canale PnL; il rischio IVA in eccesso va cercato nei corrispettivi sul rumore (sezione C) e sui checkout unpaired se entrati con aliquota 10% senza essere la copertura di un ordine lista.
`;

  fs.writeFileSync(OUT, md);
  fs.writeFileSync(OUTJ, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        delta: 488.33,
        pairsN: pairs.length,
        pairsEuro: pairs.reduce((s, p) => s + p.paypalEuro, 0),
        unpairedCheckout: {
          n: checkoutUnpaired.length,
          euro: checkoutUnpaired.reduce((s, r) => s + r.euro, 0),
          ivaCorr: checkoutUnpaired.reduce((s, r) => s + r.corrIva, 0),
        },
        noiseIvaCorr: noise.reduce((s, r) => s + r.corrIva, 0),
        byQ,
        corrByQ,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
