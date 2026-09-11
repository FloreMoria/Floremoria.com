/**
 * Confronta vendite .com lista operativa (€2431,66) vs motore RICAVI_VENDITE / vendite caratteristiche.
 * Sola lettura.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

const CSV = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-com-lista-vs-motore.json');

function euro(c: number) {
  return Math.round(c) / 100;
}

function parseCsv() {
  const raw = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0]!.split(';');
  const idx = (n: string) => h.indexOf(n);
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(';');
    const id = (c[idx('ID Ordine')] || '').trim();
    if (!id) continue;
    const price = Math.round(parseFloat((c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.') || '0') * 100) || 0;
    if (price <= 0) continue;
    const ds = (c[idx('Data')] || '').trim();
    const m = ds.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const date = m ? new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!)) : null;
    const isCom = id.startsWith('FT-') || id.startsWith('FF-');
    rows.push({ id, priceCents: price, date, isCom, q: date ? Math.floor(date.getUTCMonth() / 3) + 1 : null });
  }
  return rows;
}

async function resolveOrder(csvId: string) {
  const byNum = await prisma.order.findFirst({
    where: { orderNumber: csvId },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      totalPriceCents: true,
      grossAmount: true,
      status: true,
      isRecurring: true,
      stripeTransactionId: true,
      additionalInstructions: true,
      financeNotes: true,
      paymentMethodLabel: true,
    },
  });
  if (byNum) return byNum;
  const hits = await prisma.order.findMany({
    where: { id: { endsWith: csvId.toLowerCase() } },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      totalPriceCents: true,
      grossAmount: true,
      status: true,
      isRecurring: true,
      stripeTransactionId: true,
      additionalInstructions: true,
      financeNotes: true,
      paymentMethodLabel: true,
    },
    take: 1,
  });
  return hits[0] || null;
}

async function main() {
  const csv = parseCsv();
  const comCsv = csv.filter((r) => r.isCom);
  const euCsv = csv.filter((r) => !r.isCom);

  const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
  console.log('PnL 2026', {
    ricaviLordi: euro(pnl.ricaviLordiCents),
    venditeCaratteristiche: euro(pnl.venditeCaratteristicheCents || 0),
  });

  // All RICAVI_VENDITE 2026 positive (what feeds vendite)
  const riv = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      category: 'RICAVI_VENDITE',
      OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
    },
    select: {
      id: true,
      sourceKey: true,
      sourceType: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      orderId: true,
      documentRef: true,
      metadataJson: true,
    },
    orderBy: { accountingDate: 'asc' },
  });

  // Resolve com order ids from CSV
  const comOrders = [];
  for (const r of comCsv) {
    const o = await resolveOrder(r.id);
    comOrders.push({ csv: r, order: o });
  }
  const comOrderIds = new Set(comOrders.map((x) => x.order?.id).filter(Boolean) as string[]);
  const comOrderById = new Map(comOrders.filter((x) => x.order).map((x) => [x.order!.id, x]));

  // Also eu order ids
  const euOrderIds = new Set<string>();
  for (const r of euCsv) {
    const o = await resolveOrder(r.id);
    if (o) euOrderIds.add(o.id);
  }

  const rivInComOrders = riv.filter((r) => r.orderId && comOrderIds.has(r.orderId));
  const rivInEuOrders = riv.filter((r) => r.orderId && euOrderIds.has(r.orderId));
  const rivNoOrder = riv.filter((r) => !r.orderId);
  const rivOtherOrder = riv.filter(
    (r) => r.orderId && !comOrderIds.has(r.orderId) && !euOrderIds.has(r.orderId)
  );

  const sum = (rows: typeof riv) => rows.reduce((s, r) => s + Math.abs(r.totalCents), 0);

  // Engine rows NOT in com lista (the excess vs 2431)
  // Interpret "motore .com" as venditeCaratteristiche = all RICAVI_VENDITE counted as sales
  // Difference engine - lista.com = rows in engine that aren't com-lista orders
  const engineExtra = [...rivNoOrder, ...rivInEuOrders, ...rivOtherOrder];

  // Also: amounts on com orders in engine that exceed csv price (double count)
  const byOrderEngine = new Map<string, number>();
  for (const r of rivInComOrders) {
    byOrderEngine.set(r.orderId!, (byOrderEngine.get(r.orderId!) || 0) + Math.abs(r.totalCents));
  }
  const doubleOnCom = [];
  for (const [oid, cents] of byOrderEngine) {
    const x = comOrderById.get(oid);
    if (!x) continue;
    const csvC = x.csv.priceCents;
    if (cents > csvC + 1) {
      doubleOnCom.push({
        orderNumber: x.order?.orderNumber || x.csv.id,
        csvEuro: euro(csvC),
        engineEuro: euro(cents),
        deltaEuro: euro(cents - csvC),
        q: x.csv.q,
      });
    }
  }

  // Rows with orderId null that look like .com checkout
  const extraRows = engineExtra.map((r) => {
    const q = Math.floor(r.accountingDate.getUTCMonth() / 3) + 1;
    let bucket: string = 'altro';
    if (!r.orderId) bucket = 'ledger_senza_orderId';
    else if (euOrderIds.has(r.orderId)) bucket = 'ordine_eu_in_lista';
    else bucket = 'ordine_non_in_lista_operativa';
    return {
      sourceKey: r.sourceKey,
      sourceType: r.sourceType,
      date: r.accountingDate.toISOString().slice(0, 10),
      q,
      euro: euro(Math.abs(r.totalCents)),
      orderId: r.orderId,
      documentRef: r.documentRef,
      description: (r.description || '').slice(0, 120),
      bucket,
    };
  });

  // IVA: floral 10% on excess? Or use scorpora
  // For each extra euro of gross, IVA debito = gross - gross/1.10 for 10% floral default
  function iva10FromGross(grossCents: number) {
    const imponibile = Math.round(grossCents / 1.1);
    return grossCents - imponibile;
  }

  const extraByQ: Record<string, { euro: number; iva10Euro: number; rows: number }> = {
    T1: { euro: 0, iva10Euro: 0, rows: 0 },
    T2: { euro: 0, iva10Euro: 0, rows: 0 },
    T3: { euro: 0, iva10Euro: 0, rows: 0 },
    T4: { euro: 0, iva10Euro: 0, rows: 0 },
  };
  for (const r of extraRows) {
    const k = `T${r.q}`;
    if (!extraByQ[k]) continue;
    extraByQ[k]!.euro += r.euro;
    extraByQ[k]!.iva10Euro += iva10FromGross(Math.round(r.euro * 100)) / 100;
    extraByQ[k]!.rows += 1;
  }
  for (const k of Object.keys(extraByQ)) {
    extraByQ[k]!.euro = Math.round(extraByQ[k]!.euro * 100) / 100;
    extraByQ[k]!.iva10Euro = Math.round(extraByQ[k]!.iva10Euro * 100) / 100;
  }

  // Also check tax register / corrispettivi IVA for .com only vs all
  const { buildTaxRegisterReport } = await import('@/lib/financial/taxRegister');
  const tr = await buildTaxRegisterReport({ year: 2026, mode: 'YEAR' });

  const report = {
    generatedAt: new Date().toISOString(),
    lista: {
      comN: comCsv.length,
      comEuro: euro(comCsv.reduce((s, r) => s + r.priceCents, 0)),
      euN: euCsv.length,
      euEuro: euro(euCsv.reduce((s, r) => s + r.priceCents, 0)),
      byQCom: [1, 2, 3, 4].map((q) => ({
        q,
        n: comCsv.filter((r) => r.q === q).length,
        euro: euro(comCsv.filter((r) => r.q === q).reduce((s, r) => s + r.priceCents, 0)),
      })),
    },
    motore: {
      ricaviLordiEuro: euro(pnl.ricaviLordiCents),
      venditeCaratteristicheEuro: euro(pnl.venditeCaratteristicheCents || 0),
      rivRowsN: riv.length,
      rivEuro: euro(sum(riv)),
      breakdown: {
        onComListaOrders: { n: rivInComOrders.length, euro: euro(sum(rivInComOrders)) },
        onEuListaOrders: { n: rivInEuOrders.length, euro: euro(sum(rivInEuOrders)) },
        noOrderId: { n: rivNoOrder.length, euro: euro(sum(rivNoOrder)) },
        otherOrders: { n: rivOtherOrder.length, euro: euro(sum(rivOtherOrder)) },
      },
    },
    delta: {
      motoreMinusListaCom: euro(sum(riv) - comCsv.reduce((s, r) => s + r.priceCents, 0)),
      expected488: 488.33,
      engineExtraEuro: euro(sum(engineExtra)),
      doubleOnComEuro: Math.round(doubleOnCom.reduce((s, d) => s + d.deltaEuro, 0) * 100) / 100,
    },
    doubleOnCom,
    extraRows,
    extraByQ,
    noteIva:
      'IVA stimata a 10% floreale su lordo in eccesso (scorpora). Se le righe extra sono già in corrispettivi/taxRegister come .com, l’IVA a debito dichiarata le include.',
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    listaCom: report.lista.comEuro,
    motoreVendite: report.motore.venditeCaratteristicheEuro,
    rivEuro: report.motore.rivEuro,
    breakdown: report.motore.breakdown,
    delta: report.delta,
    extraByQ: report.extraByQ,
    doubleOnCom: report.doubleOnCom,
    extraSample: report.extraRows.slice(0, 25),
    out: OUT,
  }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
