/**
 * Punto 2: eccesso €848 Stripe+fuori vs vendite.
 * Punto 3: due RAI + aggiornato.
 * Punto 4: composizione PayPal −1990.
 * Punto 5: stato rumore RV.
 * Equazione Stripe con payout Fineco.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { sumStripeSalesTransitCents, sumPaypalPaymentAccountCents } from '@/lib/financial/gatewayTransitBalance';
import { OFFICIAL_REVENUE_2026 } from '@/lib/financial/officialRevenue2026';

const CSV = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-day-close-848-paypal-rai.json');

function euro(c: number) {
  return Math.round(c) / 100;
}

function parseLista() {
  const raw = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0]!.split(';');
  const idx = (n: string) => h.indexOf(n);
  const map = new Map<string, { cents: number; date: string }>();
  for (const line of lines.slice(1)) {
    const c = line.split(';');
    const id = (c[idx('ID Ordine')] || '').trim();
    if (!id) continue;
    const price =
      Math.round(
        parseFloat((c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.') || '0') * 100
      ) || 0;
    if (price <= 0) continue;
    const ds = (c[idx('Data')] || '').trim();
    const m = ds.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    map.set(id, {
      cents: price,
      date: m ? `${m[3]}-${m[2]}-${m[1]}` : '',
    });
  }
  return map;
}

async function main() {
  const lista = parseLista();
  const official = Math.round(OFFICIAL_REVENUE_2026.grossEuro * 100);

  // Stripe legs 2026
  const legs = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      OR: [
        { sourceKey: { startsWith: 'STRIPE_TX:' } },
        { sourceKey: { startsWith: 'STRIPE_FEE:' } },
        { sourceKey: { startsWith: 'STRIPE_REFUND:' } },
        { sourceKey: { startsWith: 'STRIPE_PAYOUT:po_' } },
        { sourceKey: { startsWith: 'MANUAL_INBOUND:' } },
      ],
    },
    select: {
      id: true,
      sourceKey: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      orderId: true,
      category: true,
    },
  });

  const sumAbs = (pred: (r: (typeof legs)[0]) => boolean) =>
    legs.filter(pred).reduce((s, r) => s + Math.abs(r.totalCents), 0);

  const tx = sumAbs((r) => r.sourceKey.startsWith('STRIPE_TX:'));
  const fee = sumAbs((r) => r.sourceKey.startsWith('STRIPE_FEE:'));
  const refund = sumAbs((r) => r.sourceKey.startsWith('STRIPE_REFUND:'));
  const payout = sumAbs((r) => r.sourceKey.startsWith('STRIPE_PAYOUT:po_'));
  const manual = sumAbs(
    (r) => r.sourceKey.startsWith('MANUAL_INBOUND:') && r.category === 'RICAVI_VENDITE'
  );

  const finecoPayout = 287826;
  const eq = tx - fee - refund - finecoPayout;

  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    select: { id: true, orderNumber: true, stripeTransactionId: true, grossAmount: true },
  });
  const onById = new Map(orders.map((o) => [o.id, o.orderNumber || '']));
  const idByOn = new Map(orders.map((o) => [o.orderNumber || '', o.id]));

  const manuals = legs.filter(
    (r) => r.sourceKey.startsWith('MANUAL_INBOUND:') && r.category === 'RICAVI_VENDITE'
  );
  const stripeTxs = legs.filter((r) => r.sourceKey.startsWith('STRIPE_TX:'));

  // Doubles: MANUAL order that also has STRIPE_TX (by orderId or amount+date±3d match to lista)
  const doubles: any[] = [];
  const stripeOnlyExtra: any[] = [];
  const usedStripe = new Set<string>();

  for (const m of manuals) {
    const on = m.orderId ? onById.get(m.orderId) : null;
    const listaRow = on ? lista.get(on) : null;
    // stripe by orderId
    let hit = stripeTxs.find((s) => s.orderId && s.orderId === m.orderId);
    if (!hit && listaRow) {
      hit = stripeTxs.find((s) => {
        if (usedStripe.has(s.id)) return false;
        if (Math.abs(Math.abs(s.totalCents) - Math.abs(m.totalCents)) > 1) return false;
        const dd =
          Math.abs(s.accountingDate.getTime() - m.accountingDate.getTime()) / 86400000;
        return dd <= 5;
      });
    }
    if (hit) {
      usedStripe.add(hit.id);
      doubles.push({
        orderNumber: on,
        manualEuro: euro(Math.abs(m.totalCents)),
        stripeEuro: euro(Math.abs(hit.totalCents)),
        manualDate: m.accountingDate.toISOString().slice(0, 10),
        stripeDate: hit.accountingDate.toISOString().slice(0, 10),
        stripeKey: hit.sourceKey,
        manualKey: m.sourceKey,
        listaEuro: listaRow ? euro(listaRow.cents) : null,
      });
    }
  }

  // Stripe TX not matched to lista order (by orderId or fuzzy amount+date)
  for (const s of stripeTxs) {
    if (usedStripe.has(s.id)) continue;
    const on = s.orderId ? onById.get(s.orderId) : null;
    if (on && lista.has(on)) continue;
    // fuzzy to lista
    const fuzzy = [...lista.entries()].find(([id, row]) => {
      if (Math.abs(row.cents - Math.abs(s.totalCents)) > 1) return false;
      if (!row.date) return false;
      const dd =
        Math.abs(new Date(row.date + 'T12:00:00Z').getTime() - s.accountingDate.getTime()) /
        86400000;
      return dd <= 3;
    });
    if (fuzzy) continue;
    stripeOnlyExtra.push({
      euro: euro(Math.abs(s.totalCents)),
      date: s.accountingDate.toISOString().slice(0, 10),
      key: s.sourceKey,
      orderId: s.orderId,
      orderNumber: on,
      desc: (s.description || '').slice(0, 100),
    });
  }

  const doublesEuro = doubles.reduce((s, d) => s + Math.round(d.manualEuro * 100), 0);
  const stripeExtraEuro = stripeOnlyExtra.reduce((s, d) => s + Math.round(d.euro * 100), 0);

  // Excess arithmetic
  const grossIncassi = tx + manual;
  const excess = grossIncassi - official;
  const refundExplains = refund;
  const remaining = excess - refundExplains;

  // PayPal account composition
  const pp = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      OR: [
        { sourceKey: { startsWith: 'PAYPAL_' } },
        { sourceType: 'PAYPAL_MOVEMENT' },
      ],
    },
    select: {
      sourceKey: true,
      category: true,
      totalCents: true,
      description: true,
      accountingDate: true,
      fiscalYear: true,
      metadataJson: true,
    },
  });

  const ppBuckets: Record<string, { n: number; cents: number }> = {};
  const bump = (k: string, c: number) => {
    ppBuckets[k] = ppBuckets[k] || { n: 0, cents: 0 };
    ppBuckets[k].n++;
    ppBuckets[k].cents += c;
  };
  for (const r of pp) {
    if (r.fiscalYear !== 2026 && !r.sourceKey.startsWith('PAYPAL_')) continue;
    const d = r.description || '';
    const signed = r.totalCents; // keep sign for account
    if (r.sourceKey.startsWith('PAYPAL_PAYOUT:')) bump('prelievi_fineco', signed);
    else if (/Addebito Sdd|Add To Balance|SDD/i.test(d) || r.category === 'TRASFERIMENTO_INTERNO')
      bump(/SDD|Add To Balance/i.test(d) ? 'addebiti_sdd' : 'trasferimenti_interni', signed);
    else if (
      ['SPESE_SAAS', 'SPESE_OPERATIVE', 'ONERI_BANCARI', 'ALTRI_COSTI', 'CONSULENZE'].includes(
        r.category
      )
    )
      bump('spese', signed);
    else if (r.sourceKey.startsWith('PAYPAL_FEE:')) bump('fee', signed);
    else if (r.sourceKey.startsWith('PAYPAL_REFUND:')) bump('refund', signed);
    else if (r.totalCents > 0) bump('accrediti_residui', signed);
    else bump('altro_uscita', signed);
  }
  const paypalLedger = await sumPaypalPaymentAccountCents();

  // RV noise status
  const rv = await prisma.financialLedgerEntry.findMany({
    where: { reversedAt: null, fiscalYear: 2026, category: 'RICAVI_VENDITE' },
    select: { totalCents: true, sourceKey: true, description: true },
  });
  const noiseStill = rv.filter((r) =>
    /BALLARATE|POSTE|ORCHIDEA|MASPES|TRANSATEL|UBIGI|FACEBK|cashback/i.test(r.description || '')
  );

  const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
  const contrib = (pnl as any).contributiEsercizioCents || 0;
  const rai = (pnl as any).risultatoAnteImposteCents as number;
  const gestione = rai - contrib; // senza contributo
  const esercizio = rai; // con contributo

  const stripeTransit = await sumStripeSalesTransitCents(2026);

  const report = {
    generatedAt: new Date().toISOString(),
    punto1_equazione: {
      txEuro: euro(tx),
      feeEuro: euro(fee),
      refundEuro: euro(refund),
      payoutFinecoEuro: euro(finecoPayout),
      payoutLedgerEuro: euro(payout),
      resultEuro: euro(eq),
      attesoEuro: 100,
      deltaVs100Euro: euro(eq - 10000),
      stripeTransitC13Euro: euro(stripeTransit),
    },
    punto2_eccesso: {
      stripeTxEuro: euro(tx),
      fuoriGatewayEuro: euro(manual),
      sommaEuro: euro(grossIncassi),
      venditeOfficialEuro: euro(official),
      excessEuro: euro(excess),
      refundExplainsEuro: euro(refundExplains),
      remainingAfterRefundEuro: euro(remaining),
      doublesManualAndStripe: {
        n: doubles.length,
        euro: euro(doublesEuro),
        rows: doubles,
      },
      stripeWithoutListaMatch: {
        n: stripeOnlyExtra.length,
        euro: euro(stripeExtraEuro),
        rows: stripeOnlyExtra,
      },
      explainedEuro: euro(doublesEuro + stripeExtraEuro),
    },
    punto3_rai: {
      risultatoGestioneSenzaContributoEuro: euro(gestione),
      risultatoEsercizioConContributoEuro: euro(esercizio),
      contributoEuro: euro(contrib),
      venditePnLEuro: euro((pnl as any).venditeCaratteristicheCents),
      altriRicaviEuro: euro((pnl as any).altriRicaviCents),
      note: 'gestione = RAI − contributi; esercizio = RAI (include contributo CCIAA)',
    },
    punto4_paypal: {
      ledgerAccountEuro: euro(paypalLedger),
      declaredEuro: 0,
      deltaEuro: euro(paypalLedger),
      buckets: Object.fromEntries(
        Object.entries(ppBuckets).map(([k, v]) => [
          k,
          { n: v.n, euro: euro(v.cents) },
        ])
      ),
    },
    punto5_rvNoise: {
      stillInRvNoiseN: noiseStill.length,
      stillInRvNoiseEuro: euro(noiseStill.reduce((s, r) => s + r.totalCents, 0)),
      rvPosEuro: euro(rv.filter((r) => r.totalCents > 0).reduce((s, r) => s + r.totalCents, 0)),
      rvNegEuro: euro(rv.filter((r) => r.totalCents < 0).reduce((s, r) => s + r.totalCents, 0)),
      note: 'Rumore Ballarate/Poste/… e −2693 già riclassificati nel giro precedente; residuo sotto',
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
