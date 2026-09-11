/**
 * Ricostruisce post-L3 vendite (€2919,99) = composizione PRE − L3, e Δ vs lista .com.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';

const COMP = path.join(process.cwd(), 'docs/verbali/dossier_fase4b_vendite_composizione_export.json');
const CSV = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-com-488-exact.json');

function euro(c: number) {
  return Math.round(c) / 100;
}
function iva10(grossEuro: number) {
  const g = Math.round(grossEuro * 100);
  return (g - Math.round(g / 1.1)) / 100;
}

function parseListaCom() {
  const raw = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0]!.split(';');
  const idx = (n: string) => h.indexOf(n);
  const com: { id: string; cents: number; q: number | null; date: string }[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(';');
    const id = (c[idx('ID Ordine')] || '').trim();
    if (!id.startsWith('FT-') && !id.startsWith('FF-')) continue;
    const price =
      Math.round(
        parseFloat((c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.') || '0') * 100
      ) || 0;
    if (price <= 0) continue;
    const ds = (c[idx('Data')] || '').trim();
    const m = ds.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const q = m ? Math.floor((+m[2]! - 1) / 3) + 1 : null;
    com.push({ id, cents: price, q, date: m ? `${m[3]}-${m[2]}-${m[1]}` : '' });
  }
  return com;
}

async function main() {
  const comp = JSON.parse(fs.readFileSync(COMP, 'utf8')) as {
    rows: { id: string; totalCents: number; sourceKey: string; sourceType: string; category: string }[];
  };
  const preIds = comp.rows.map((r) => r.id);

  // Current category of every pre-L3 vendite row
  const liveAll = await prisma.financialLedgerEntry.findMany({
    where: { id: { in: preIds } },
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
      category: true,
      metadataJson: true,
    },
  });
  const orderIds = [...new Set(liveAll.map((r) => r.orderId).filter(Boolean))] as string[];
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, orderNumber: true },
  });
  const orderNumById = new Map(orders.map((o) => [o.id, o.orderNumber]));
  const liveById = new Map(
    liveAll.map((r) => [
      r.id,
      { ...r, orderNumber: r.orderId ? orderNumById.get(r.orderId) || null : null },
    ])
  );

  const l3InPre = comp.rows.filter((r) => {
    const L = liveById.get(r.id);
    return L && L.category === 'TRASFERIMENTO_INTERNO';
  });
  const l3Sum = l3InPre.reduce((s, r) => s + Math.abs(r.totalCents), 0);

  // Post-L3: still RICAVI_VENDITE (or whatever was sold) among pre rows not reclassed
  const post = comp.rows.filter((r) => {
    const L = liveById.get(r.id);
    return L && L.category === 'RICAVI_VENDITE';
  });
  // Also include pre rows missing from DB? treat as gone
  const missing = comp.rows.filter((r) => !liveById.has(r.id));
  const postSum = post.reduce((s, r) => s + Math.abs(r.totalCents), 0);

  const lista = parseListaCom();
  const listaIds = new Set(lista.map((r) => r.id));
  const listaCents = lista.reduce((s, r) => s + r.cents, 0);
  const listaEuro = euro(listaCents);

  const matched: any[] = [];
  const notInLista: any[] = [];
  const usedLista = new Set<string>();

  for (const r of post) {
    const L = liveById.get(r.id)!;
    const on = L.orderNumber || '';
    const desc = L.description || '';
    const ref = L.documentRef || '';
    let hit =
      (on && listaIds.has(on) ? on : null) ||
      [...listaIds].find((id) => desc.includes(id) || ref.includes(id) || (L.sourceKey || '').includes(id)) ||
      null;
    if (!hit && L.accountingDate) {
      const qCands = lista.filter(
        (o) =>
          !usedLista.has(o.id) &&
          Math.abs(o.cents - Math.abs(r.totalCents)) <= 1 &&
          o.date &&
          Math.abs(new Date(o.date + 'T12:00:00Z').getTime() - L.accountingDate.getTime()) <= 3 * 86400000
      );
      if (qCands.length === 1) hit = qCands[0]!.id;
    }
    const q = Math.floor(L.accountingDate.getUTCMonth() / 3) + 1;
    const row = {
      id: r.id,
      sourceKey: L.sourceKey,
      sourceType: L.sourceType,
      euro: euro(Math.abs(r.totalCents)),
      date: L.accountingDate.toISOString().slice(0, 10),
      q,
      orderNumber: on || null,
      orderId: L.orderId || null,
      description: (desc || '').slice(0, 120),
      vatLedgerEuro: euro(Math.abs(L.vatCents || 0)),
      vatRate: L.vatRate ?? null,
      matchedListaId: hit,
      categoryNow: L.category,
    };
    if (hit) {
      usedLista.add(hit);
      matched.push(row);
    } else notInLista.push(row);
  }

  const notSum = notInLista.reduce((s, r) => s + r.euro, 0);
  const matchedSum = matched.reduce((s, r) => s + r.euro, 0);
  const overmatch = Math.round((matchedSum - listaEuro) * 100) / 100;

  // Exact subset summing to 488.33
  const target = 488.33;
  const targetC = Math.round(target * 100);
  const items = notInLista.map((r) => ({ ...r, c: Math.round(r.euro * 100) }));
  let best: typeof items = [];
  let bestDiff = Infinity;
  const n = items.length;
  if (n <= 22) {
    for (let m = 0; m < 1 << n; m++) {
      let s = 0;
      const pick = [];
      for (let i = 0; i < n; i++)
        if (m & (1 << i)) {
          s += items[i]!.c;
          pick.push(items[i]!);
        }
      const d = Math.abs(s - targetC);
      if (d < bestDiff) {
        bestDiff = d;
        best = pick;
      }
    }
  } else {
    // meet in middle
    const half = Math.floor(n / 2);
    const A = items.slice(0, half);
    const B = items.slice(half);
    type Pair = { sum: number; mask: number };
    const left: Pair[] = [];
    for (let m = 0; m < 1 << A.length; m++) {
      let s = 0;
      for (let i = 0; i < A.length; i++) if (m & (1 << i)) s += A[i]!.c;
      left.push({ sum: s, mask: m });
    }
    left.sort((a, b) => a.sum - b.sum);
    for (let m = 0; m < 1 << B.length; m++) {
      let s = 0;
      for (let i = 0; i < B.length; i++) if (m & (1 << i)) s += B[i]!.c;
      const need = targetC - s;
      // binary search closest
      let lo = 0,
        hi = left.length - 1,
        bestIdx = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (left[mid]!.sum < need) lo = mid + 1;
        else hi = mid - 1;
      }
      for (const idx of [lo, hi, lo - 1, lo + 1]) {
        if (idx < 0 || idx >= left.length) continue;
        const d = Math.abs(left[idx]!.sum + s - targetC);
        if (d < bestDiff) {
          bestDiff = d;
          const ma = left[idx]!.mask;
          const pick = [];
          for (let i = 0; i < A.length; i++) if (ma & (1 << i)) pick.push(A[i]!);
          for (let i = 0; i < B.length; i++) if (m & (1 << i)) pick.push(B[i]!);
          best = pick;
        }
      }
    }
  }

  const byQ = (rows: { q: number | null; euro: number; vatLedgerEuro: number }[]) => {
    const o: Record<string, any> = {};
    for (const r of rows) {
      const k = r.q ? `T${r.q}` : 'Tx';
      o[k] = o[k] || { n: 0, euro: 0, iva10: 0, vatLedger: 0 };
      o[k].n++;
      o[k].euro += r.euro;
      o[k].iva10 += iva10(r.euro);
      o[k].vatLedger += r.vatLedgerEuro;
    }
    for (const v of Object.values(o) as any[]) {
      v.euro = Math.round(v.euro * 100) / 100;
      v.iva10 = Math.round(v.iva10 * 100) / 100;
      v.vatLedger = Math.round(v.vatLedger * 100) / 100;
    }
    return o;
  };

  // Categories of pre rows not in post/l3
  const otherCat: Record<string, { n: number; euro: number }> = {};
  for (const r of comp.rows) {
    const L = liveById.get(r.id);
    const cat = L?.category || 'MISSING';
    if (cat === 'RICAVI_VENDITE' || cat === 'TRASFERIMENTO_INTERNO') continue;
    otherCat[cat] = otherCat[cat] || { n: 0, euro: 0 };
    otherCat[cat].n++;
    otherCat[cat].euro += euro(Math.abs(r.totalCents));
  }

  // Lista com NOT covered by matched
  const uncovered = lista.filter((o) => !usedLista.has(o.id));

  const report = {
    generatedAt: new Date().toISOString(),
    rebuild: {
      preN: comp.rows.length,
      preEuro: euro(comp.rows.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
      l3N: l3InPre.length,
      l3Euro: euro(l3Sum),
      postN: post.length,
      postEuro: euro(postSum),
      expectedPost: 2919.99,
      deltaVsExpected: Math.round((euro(postSum) - 2919.99) * 100) / 100,
      missingFromDb: missing.length,
      otherCategories: otherCat,
    },
    listaCom: { n: lista.length, euro: listaEuro },
    matched: {
      n: matched.length,
      euro: Math.round(matchedSum * 100) / 100,
      overmatchVsLista: overmatch,
      uncoveredLista: uncovered.map((o) => ({ id: o.id, euro: euro(o.cents), q: o.q, date: o.date })),
    },
    notInLista: {
      n: notInLista.length,
      euro: Math.round(notSum * 100) / 100,
      byQ: byQ(notInLista),
      bySourceType: notInLista.reduce((acc: any, r) => {
        acc[r.sourceType] = acc[r.sourceType] || { n: 0, euro: 0 };
        acc[r.sourceType].n++;
        acc[r.sourceType].euro = Math.round((acc[r.sourceType].euro + r.euro) * 100) / 100;
        return acc;
      }, {}),
      rows: notInLista.sort((a, b) => a.date.localeCompare(b.date)),
    },
    exact488: {
      target,
      bestDiffEuro: bestDiff / 100,
      n: best.length,
      euro: Math.round(best.reduce((s, r) => s + r.euro, 0) * 100) / 100,
      iva10: Math.round(best.reduce((s, r) => s + iva10(r.euro), 0) * 100) / 100,
      vatLedger: Math.round(best.reduce((s, r) => s + r.vatLedgerEuro, 0) * 100) / 100,
      byQ: byQ(best),
      rows: best.sort((a, b) => a.date.localeCompare(b.date)),
    },
    arithmetic: {
      postMinusLista: Math.round((euro(postSum) - listaEuro) * 100) / 100,
      notInListaPlusOvermatch: Math.round((notSum + Math.max(0, overmatch)) * 100) / 100,
      notInListaMinusUndermatch:
        overmatch < 0
          ? Math.round((notSum + overmatch) * 100) / 100
          : Math.round(notSum * 100) / 100,
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        rebuild: report.rebuild,
        lista: report.listaCom,
        matched: {
          n: report.matched.n,
          euro: report.matched.euro,
          overmatch: report.matched.overmatchVsLista,
          uncoveredN: report.matched.uncoveredLista.length,
          uncoveredEuro: euro(uncovered.reduce((s, o) => s + o.cents, 0)),
        },
        notInLista: {
          n: report.notInLista.n,
          euro: report.notInLista.euro,
          byQ: report.notInLista.byQ,
          bySourceType: report.notInLista.bySourceType,
        },
        exact488: {
          bestDiffEuro: report.exact488.bestDiffEuro,
          n: report.exact488.n,
          euro: report.exact488.euro,
          iva10: report.exact488.iva10,
          vatLedger: report.exact488.vatLedger,
          byQ: report.exact488.byQ,
        },
        arithmetic: report.arithmetic,
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
