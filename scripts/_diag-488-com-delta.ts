/**
 * Isola i €488,33: vendite motore freeze .com €2.919,99 − lista .com €2.431,66.
 * Ricostruisce il set post-L3 (righe ancora RICAVI_VENDITE) e le confronta con la lista.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';

const CSV = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');
const COMP = path.join(
  process.cwd(),
  'docs/verbali/dossier_fase4b_vendite_composizione_export.json'
);
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-com-488-delta.json');

function euro(c: number) {
  return Math.round(c) / 100;
}
function iva10(grossCents: number) {
  const imp = Math.round(grossCents / 1.1);
  return grossCents - imp;
}

function parseComLista() {
  const raw = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0]!.split(';');
  const idx = (n: string) => h.indexOf(n);
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(';');
    const id = (c[idx('ID Ordine')] || '').trim();
    if (!id || !(id.startsWith('FT-') || id.startsWith('FF-'))) continue;
    const price =
      Math.round(
        parseFloat((c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.') || '0') * 100
      ) || 0;
    if (price <= 0) continue;
    const ds = (c[idx('Data')] || '').trim();
    const m = ds.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const date = m ? new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!)) : null;
    rows.push({
      id,
      priceCents: price,
      date,
      q: date ? Math.floor(date.getUTCMonth() / 3) + 1 : null,
    });
  }
  return rows;
}

async function resolve(csvId: string) {
  const byNum = await prisma.order.findFirst({
    where: { orderNumber: csvId },
    select: { id: true, orderNumber: true },
  });
  if (byNum) return byNum;
  const hits = await prisma.order.findMany({
    where: { id: { endsWith: csvId.toLowerCase() } },
    select: { id: true, orderNumber: true },
    take: 1,
  });
  return hits[0] || null;
}

async function main() {
  const comp = JSON.parse(fs.readFileSync(COMP, 'utf8')) as {
    rows: Array<{
      id: string;
      totalCents: number;
      sourceType: string;
      sourceKey: string;
      category: string;
    }>;
  };
  const preIds = comp.rows.map((r) => r.id);
  const live = await prisma.financialLedgerEntry.findMany({
    where: { id: { in: preIds } },
    select: {
      id: true,
      sourceKey: true,
      sourceType: true,
      category: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      orderId: true,
      documentRef: true,
      reversedAt: true,
      vatCents: true,
      vatRate: true,
    },
  });
  const byId = new Map(live.map((r) => [r.id, r]));

  // Post-L3 = still RICAVI_VENDITE and not reversed (or use absolute from live category)
  const postL3 = [];
  for (const pre of comp.rows) {
    const cur = byId.get(pre.id);
    if (!cur) continue;
    if (cur.reversedAt) continue;
    if (cur.category !== 'RICAVI_VENDITE') continue;
    if (!(cur.totalCents > 0)) continue;
    postL3.push(cur);
  }
  const postSum = postL3.reduce((s, r) => s + r.totalCents, 0);
  console.log('postL3 from pre-composition still RV', {
    n: postL3.length,
    euro: euro(postSum),
    freezeTarget: 2919.99,
  });

  // If sum != 2919.99, also take ALL current RV 2026 excluding eu stripe / known patterns
  // and find subset - but first compare postL3 to lista

  const comLista = parseComLista();
  const comOrderIds = new Set<string>();
  const comByOrderId = new Map<string, (typeof comLista)[0]>();
  for (const r of comLista) {
    const o = await resolve(r.id);
    if (o) {
      comOrderIds.add(o.id);
      comByOrderId.set(o.id, r);
    }
  }

  // Match postL3 rows to com lista via orderId or documentRef order number
  const matched: typeof postL3 = [];
  const unmatched: typeof postL3 = [];
  for (const r of postL3) {
    const ref = (r.documentRef || '').trim();
    const desc = r.description || '';
    let hit = false;
    if (r.orderId && comOrderIds.has(r.orderId)) hit = true;
    if (!hit && ref && (ref.startsWith('FT-') || ref.startsWith('FF-'))) {
      if (comLista.some((c) => c.id === ref)) hit = true;
    }
    if (!hit && /Ordine (FT-|FF-)[A-Z]{2}-\d{2}-\d{3}/i.test(desc)) {
      const m = desc.match(/(FT-|FF-)[A-Z]{2}-\d{2}-\d{3}/i);
      if (m && comLista.some((c) => c.id === m[0]!.toUpperCase())) hit = true;
    }
    (hit ? matched : unmatched).push(r);
  }

  const sumM = matched.reduce((s, r) => s + r.totalCents, 0);
  const sumU = unmatched.reduce((s, r) => s + r.totalCents, 0);

  // Deduplicate unmatched by economic identity (same day+amount may be JSON+Stripe double)
  // For delta analysis: group unmatched
  const unmatchedRows = unmatched.map((r) => {
    const q = Math.floor(r.accountingDate.getUTCMonth() / 3) + 1;
    const sk = r.sourceKey;
    let kind = 'altro';
    if (sk.startsWith('JSON_ENTRY:')) kind = 'json_entry';
    else if (sk.startsWith('ORDER:')) kind = 'order';
    else if (sk.startsWith('PAYPAL_TX:')) kind = 'paypal_tx';
    else if (sk.startsWith('STRIPE_TX:') || sk.includes('stripe')) kind = 'stripe';
    else if (r.sourceType === 'STRIPE_MOVEMENT') kind = 'stripe';
    else if (r.sourceType === 'PAYPAL_MOVEMENT') kind = 'paypal_tx';
    const isEu = /stripe_eu|_eu_tx/i.test(sk) || /stripe_eu/i.test(r.description || '');
    return {
      id: r.id,
      date: r.accountingDate.toISOString().slice(0, 10),
      q,
      euro: euro(r.totalCents),
      vatEuro: euro(Math.abs(r.vatCents || iva10(r.totalCents))),
      vatStored: r.vatCents !== 0,
      vatRate: r.vatRate,
      sourceKey: r.sourceKey,
      sourceType: r.sourceType,
      documentRef: r.documentRef,
      description: (r.description || '').slice(0, 140),
      orderId: r.orderId,
      kind,
      isEuStripe: isEu,
    };
  });

  // Also: current live RV that sum near 2919 if postL3 drifted
  const liveRv = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      category: 'RICAVI_VENDITE',
      totalCents: { gt: 0 },
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
      vatCents: true,
      vatRate: true,
    },
  });

  // "Motore stile freeze": exclude stripe_eu, exclude rows linked only to eu lista orders
  // Actually user compares 2919 to 2431 - use postL3 unmatched as the answer if sum ≈ 488

  // Alternative path: lista.com sum vs postL3 matched unique by order
  // Collapse matched to unique order amounts
  const matchedByRef = new Map<string, number>();
  for (const r of matched) {
    const key =
      r.orderId ||
      r.documentRef ||
      r.sourceKey;
    matchedByRef.set(key, (matchedByRef.get(key) || 0) + r.totalCents);
  }

  // Build delta as: postL3 total - lista com, explain with unmatched + doubles
  const listaComEuro = euro(comLista.reduce((s, r) => s + r.priceCents, 0));

  // Find doubles in postL3: same order/document counted twice (JSON + Stripe)
  const byDoc = new Map<string, typeof postL3>();
  for (const r of postL3) {
    let k = r.orderId || '';
    const m = (r.description || '').match(/(FT-|FF-)[A-Z]{2}-\d{2}-\d{3}/i);
    if (m) k = m[0]!.toUpperCase();
    else if (r.documentRef && /^F[TF]-/.test(r.documentRef)) k = r.documentRef;
    if (!k) continue;
    const list = byDoc.get(k) || [];
    list.push(r);
    byDoc.set(k, list);
  }
  const doubles = [];
  for (const [k, list] of byDoc) {
    if (list.length < 2) continue;
    const tot = list.reduce((s, r) => s + r.totalCents, 0);
    const maxOne = Math.max(...list.map((r) => r.totalCents));
    if (tot > maxOne + 1) {
      doubles.push({
        key: k,
        n: list.length,
        euroTotal: euro(tot),
        euroExtra: euro(tot - maxOne),
        q: Math.floor(list[0]!.accountingDate.getUTCMonth() / 3) + 1,
        keys: list.map((r) => r.sourceKey),
      });
    }
  }

  const byQ: Record<string, { euro: number; ivaEuro: number; rows: typeof unmatchedRows }> = {
    T1: { euro: 0, ivaEuro: 0, rows: [] },
    T2: { euro: 0, ivaEuro: 0, rows: [] },
    T3: { euro: 0, ivaEuro: 0, rows: [] },
  };
  for (const r of unmatchedRows) {
    const t = `T${r.q}`;
    if (!byQ[t]) continue;
    byQ[t]!.euro += r.euro;
    // IVA: use stored vat if present else estimate 10%
    const iva = r.vatStored ? r.vatEuro : euro(iva10(Math.round(r.euro * 100)));
    byQ[t]!.ivaEuro += iva;
    byQ[t]!.rows.push(r);
  }
  for (const t of Object.keys(byQ)) {
    byQ[t]!.euro = Math.round(byQ[t]!.euro * 100) / 100;
    byQ[t]!.ivaEuro = Math.round(byQ[t]!.ivaEuro * 100) / 100;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    targets: {
      motoreFreezeCom: 2919.99,
      listaCom: listaComEuro,
      delta: Math.round((2919.99 - listaComEuro) * 100) / 100,
    },
    postL3Rebuilt: {
      n: postL3.length,
      euro: euro(postSum),
      matchedToListaCom: { n: matched.length, euro: euro(sumM) },
      notInListaCom: { n: unmatched.length, euro: euro(sumU) },
    },
    doublesInPostL3: {
      n: doubles.length,
      extraEuro: Math.round(doubles.reduce((s, d) => s + d.euroExtra, 0) * 100) / 100,
      items: doubles,
    },
    notInListaByQ: byQ,
    notInListaRows: unmatchedRows.sort((a, b) => a.date.localeCompare(b.date)),
    kindBreakdown: Object.fromEntries(
      Object.entries(
        unmatchedRows.reduce(
          (acc, r) => {
            const k = r.isEuStripe ? 'stripe_eu' : r.kind;
            acc[k] = acc[k] || { n: 0, euro: 0 };
            acc[k].n += 1;
            acc[k].euro += r.euro;
            return acc;
          },
          {} as Record<string, { n: number; euro: number }>
        )
      ).map(([k, v]) => [k, { n: v.n, euro: Math.round(v.euro * 100) / 100 }])
    ),
    interpretation:
      'Il motore freeze €2919,99 è Σ RICAVI_VENDITE post-L3 (non la lista ordini .com). La Δ €488 vs lista sono righe ledger ancora in RICAVI_VENDITE non agganciate agli ordini FT-/FF- della lista operativa (o doppi JSON+Stripe, o .eu/PayPal orfani).',
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        targets: report.targets,
        postL3Rebuilt: report.postL3Rebuilt,
        doubles: report.doublesInPostL3,
        kindBreakdown: report.kindBreakdown,
        byQ: Object.fromEntries(
          Object.entries(byQ).map(([k, v]) => [
            k,
            { euro: v.euro, ivaEuro: v.ivaEuro, n: v.rows.length },
          ])
        ),
        unmatchedSample: unmatchedRows.slice(0, 40),
        out: OUT,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
