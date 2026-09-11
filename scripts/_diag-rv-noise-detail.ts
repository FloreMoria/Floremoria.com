/**
 * Dettaglio rumore positivi RICAVI_VENDITE vs fatturato ufficiale €4098.68.
 * Trova anche i negativi ex-RV riclassificati (storico −2693).
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { OFFICIAL_REVENUE_2026 } from '@/lib/financial/officialRevenue2026';

const CSV = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-rv-noise-detail.json');

function euro(c: number) {
  return Math.round(c) / 100;
}

function parseLista() {
  const raw = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0]!.split(';');
  const idx = (n: string) => h.indexOf(n);
  const map = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const c = line.split(';');
    const id = (c[idx('ID Ordine')] || '').trim();
    if (!id) continue;
    const price =
      Math.round(
        parseFloat((c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.') || '0') * 100
      ) || 0;
    if (price <= 0) continue;
    map.set(id, price);
  }
  return map;
}

async function main() {
  const lista = parseLista();
  const listaEuro = euro([...lista.values()].reduce((s, c) => s + c, 0));

  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    select: { id: true, orderNumber: true },
  });
  const onById = new Map(orders.map((o) => [o.id, o.orderNumber]));

  const rows = await prisma.financialLedgerEntry.findMany({
    where: { reversedAt: null, fiscalYear: 2026, category: 'RICAVI_VENDITE' },
    select: {
      id: true,
      sourceKey: true,
      sourceType: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      orderId: true,
      counterpartyName: true,
      metadataJson: true,
    },
  });

  // Bucket positives by source family
  const buckets: Record<string, { n: number; cents: number; rows: any[] }> = {};
  const bump = (k: string, r: (typeof rows)[0]) => {
    buckets[k] = buckets[k] || { n: 0, cents: 0, rows: [] };
    buckets[k].n++;
    buckets[k].cents += r.totalCents;
    buckets[k].rows.push({
      id: r.id,
      euro: euro(r.totalCents),
      date: r.accountingDate.toISOString().slice(0, 10),
      sk: r.sourceKey,
      on: r.orderId ? onById.get(r.orderId) : null,
      desc: (r.description || '').slice(0, 100),
    });
  };

  for (const r of rows) {
    if (r.totalCents < 0) {
      bump('NEG_in_RV', r);
      continue;
    }
    const sk = r.sourceKey;
    if (sk.startsWith('STRIPE_TX:')) bump('STRIPE_TX', r);
    else if (sk.startsWith('MANUAL_INBOUND:')) bump('MANUAL_INBOUND_fuori_gw', r);
    else if (sk.startsWith('JSON_ENTRY:')) bump('JSON_ENTRY', r);
    else if (sk.startsWith('PAYPAL_TX:') || r.sourceType === 'PAYPAL_MOVEMENT') bump('PAYPAL', r);
    else if (sk.startsWith('ORDER:') || r.sourceType === 'ORDER') bump('ORDER_legacy', r);
    else if (sk.startsWith('BANK_LINE:')) bump('BANK_LINE_pos', r);
    else if (sk.startsWith('CUSTOMER_RECEIPT:')) bump('CUSTOMER_RECEIPT', r);
    else bump('OTHER_POS', r);
  }

  // Doubles: same orderId with >1 positive RV
  const byOrder = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.orderId || r.totalCents <= 0) continue;
    const arr = byOrder.get(r.orderId) || [];
    arr.push(r);
    byOrder.set(r.orderId, arr);
  }
  const doubles = [...byOrder.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([oid, arr]) => ({
      orderId: oid,
      orderNumber: onById.get(oid),
      n: arr.length,
      euro: euro(arr.reduce((s, r) => s + r.totalCents, 0)),
      listaEuro: onById.get(oid) ? euro(lista.get(onById.get(oid)!) || 0) : null,
      keys: arr.map((r) => r.sourceKey),
    }));

  // Ex-RV negatives now elsewhere (batch markers or paypal costs / TI)
  const exNeg = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      totalCents: { lt: 0 },
      OR: [
        { metadataJson: { path: ['archPaypalCostFromRv'], equals: true } },
        { metadataJson: { path: ['archBatch'], equals: 'ARCH_STRIPE_ONLY_20260911' } },
        {
          AND: [
            { category: { not: 'RICAVI_VENDITE' } },
            {
              OR: [
                { sourceType: 'PAYPAL_MOVEMENT' },
                { sourceKey: { startsWith: 'BANK_LINE:' } },
              ],
            },
            {
              category: {
                in: [
                  'SPESE_SAAS',
                  'SPESE_OPERATIVE',
                  'ONERI_BANCARI',
                  'ALTRI_COSTI',
                  'COSTI_FIORISTI',
                  'DA_CLASSIFICARE',
                  'TRASFERIMENTO_INTERNO',
                ],
              },
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      category: true,
      totalCents: true,
      sourceType: true,
      sourceKey: true,
      description: true,
      metadataJson: true,
    },
    take: 5000,
  });

  // Better: find BANK_LINE and PAYPAL negatives that were historically RV - check composition export
  const preNeg = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'docs/verbali/dossier_fase4b_vendite_composizione_export.json'),
      'utf8'
    )
  );
  // negativeRowsHierarchy if present
  const negHier = preNeg.negativeRowsHierarchy || preNeg.meta?.decomposizioneNegativiHierarchy;

  // Current bank lines negative not in RV
  const bankNeg = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      sourceKey: { startsWith: 'BANK_LINE:' },
      totalCents: { lt: 0 },
    },
    select: {
      id: true,
      category: true,
      totalCents: true,
      description: true,
    },
  });

  const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
  const raiWithContrib = (pnl as any).risultatoAnteImposteCents as number;
  const contrib = (pnl as any).contributiEsercizioCents || 0;
  const raiWithoutContrib = raiWithContrib - contrib;

  // How PnL filters vendite - re-list what compute uses
  const { listHistoricalLedgerEntries } = await import('@/lib/financial/historicalLedgerQuery');
  // just report pnl numbers

  const report = {
    generatedAt: new Date().toISOString(),
    listaOfficialEuro: listaEuro,
    rvPosByBucket: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [
        k,
        { n: v.n, euro: euro(v.cents), sample: v.rows.slice(0, 5) },
      ])
    ),
    doubles: {
      nOrders: doubles.length,
      extraEuro: euro(
        doubles.reduce((s, d) => {
          const listaC = d.listaEuro != null ? Math.round(d.listaEuro * 100) : 0;
          return s + Math.max(0, Math.round(d.euro * 100) - listaC);
        }, 0)
      ),
      items: doubles.slice(0, 40),
    },
    preL3NegHierarchy: negHier,
    bankNegOutsideRv: {
      n: bankNeg.length,
      euro: euro(bankNeg.reduce((s, r) => s + r.totalCents, 0)),
      byCat: bankNeg.reduce((acc: any, r) => {
        acc[r.category] = acc[r.category] || { n: 0, euro: 0 };
        acc[r.category].n++;
        acc[r.category].euro = euro(
          Math.round(acc[r.category].euro * 100) + r.totalCents
        );
        return acc;
      }, {}),
      sample: bankNeg
        .sort((a, b) => a.totalCents - b.totalCents)
        .slice(0, 15)
        .map((r) => ({
          euro: euro(r.totalCents),
          cat: r.category,
          desc: r.description.slice(0, 100),
        })),
    },
    contributo: {
      cents: contrib,
      euro: euro(contrib),
      raiWithContribEuro: euro(raiWithContrib),
      raiWithoutContribEuro: euro(raiWithoutContrib),
      note: 'RAI corrente INCLUDE il contributo (+4597.66). RAI senza contributo = RAI − 4597.66',
    },
    pnl: {
      vendite: euro((pnl as any).venditeCaratteristicheCents),
      altri: euro((pnl as any).altriRicaviCents),
      contributi: euro(contrib),
      ricaviLordi: euro((pnl as any).ricaviLordiCents),
      rai: euro(raiWithContrib),
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2).slice(0, 8000));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
