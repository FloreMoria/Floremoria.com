/**
 * Censimento rumore in RICAVI_VENDITE 2026 (positivi + negativi).
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { OFFICIAL_REVENUE_2026 } from '@/lib/financial/officialRevenue2026';

const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-rv-noise.json');

function euro(c: number) {
  return Math.round(c) / 100;
}

type Nature =
  | 'spesa_saas_poste_ubigi'
  | 'movimento_fiorista'
  | 'cashback'
  | 'contributo_pubblico'
  | 'paypal_residuo_non_vendita'
  | 'bank_negativo_non_chiarito'
  | 'rimborso_o_storno'
  | 'vendita_plausibile'
  | 'altro';

function classify(r: {
  totalCents: number;
  description: string;
  sourceType: string;
  sourceKey: string;
  counterpartyName: string | null;
}): Nature {
  const d = `${r.description || ''} ${r.counterpartyName || ''}`;
  if (/cashback/i.test(d)) return 'cashback';
  if (/Bando Nuova Impresa|Cciaa|CCIAA|Contributo/i.test(d)) return 'contributo_pubblico';
  if (
    /BALLARATE|POSTE|ORCHIDEA|MASPES|TRANSATEL|UBIGI|FACEBK|Adobe|Google|Meta|OpenAI|Vercel|Cursor|SaaS|Wix\.com|SDD|Add To Balance/i.test(
      d
    )
  )
    return 'spesa_saas_poste_ubigi';
  if (
    /fiorist|FIORIST|EREDI|BENDA|floricol|vivaio|piante|bouquet|compenso fiorista|FLORIST/i.test(d) ||
    r.sourceType === 'FLORIST_PAYOUT'
  )
    return 'movimento_fiorista';
  if (r.totalCents < 0 && (r.sourceType === 'BANK_LINE' || r.sourceKey.startsWith('BANK_LINE:')))
    return 'bank_negativo_non_chiarito';
  if (r.totalCents < 0 && /rimbors|refund|storno/i.test(d)) return 'rimborso_o_storno';
  if (r.totalCents < 0) return 'altro';
  // positive
  if (
    r.sourceKey.startsWith('STRIPE_TX:') ||
    r.sourceKey.startsWith('MANUAL_INBOUND:') ||
    r.sourceKey.startsWith('ORDER:') ||
    /Checkout|Acquisto Floremoria|Ordine FloreMoria|Incasso/i.test(d)
  )
    return 'vendita_plausibile';
  if (r.sourceKey.startsWith('PAYPAL_TX:') || r.sourceType === 'PAYPAL_MOVEMENT')
    return 'paypal_residuo_non_vendita';
  if (r.sourceType === 'BANK_LINE' || r.sourceKey.startsWith('BANK_LINE:')) return 'altro';
  return 'altro';
}

async function main() {
  const rows = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      category: 'RICAVI_VENDITE',
    },
    select: {
      id: true,
      sourceKey: true,
      sourceType: true,
      totalCents: true,
      direction: true,
      accountingDate: true,
      description: true,
      counterpartyName: true,
      orderId: true,
      bankLineId: true,
    },
    orderBy: { accountingDate: 'asc' },
  });

  const byNature: Record<
    string,
    { n: number; euroSigned: number; euroAbs: number; pos: number; neg: number; rows: any[] }
  > = {};

  let pos = 0;
  let neg = 0;
  for (const r of rows) {
    const nat = classify(r);
    byNature[nat] = byNature[nat] || {
      n: 0,
      euroSigned: 0,
      euroAbs: 0,
      pos: 0,
      neg: 0,
      rows: [],
    };
    byNature[nat].n++;
    byNature[nat].euroSigned += r.totalCents;
    byNature[nat].euroAbs += Math.abs(r.totalCents);
    if (r.totalCents >= 0) {
      byNature[nat].pos += r.totalCents;
      pos += r.totalCents;
    } else {
      byNature[nat].neg += r.totalCents;
      neg += r.totalCents;
    }
    byNature[nat].rows.push({
      id: r.id,
      date: r.accountingDate.toISOString().slice(0, 10),
      euro: euro(r.totalCents),
      sk: r.sourceKey,
      st: r.sourceType,
      desc: (r.description || '').slice(0, 140),
      cp: r.counterpartyName,
      orderId: r.orderId,
    });
  }

  // Known negatives target
  const negRows = rows.filter((r) => r.totalCents < 0);
  const negBank = negRows.filter(
    (r) => r.sourceType === 'BANK_LINE' || r.sourceKey.startsWith('BANK_LINE:')
  );
  const negPaypal = negRows.filter(
    (r) => r.sourceType === 'PAYPAL_MOVEMENT' || r.sourceKey.startsWith('PAYPAL_')
  );

  const contrib = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      OR: [
        { totalCents: 459766 },
        { description: { contains: 'Bando Nuova Impresa' } },
        { category: 'CONTRIBUTI_ESERCIZIO' },
      ],
    },
    select: {
      id: true,
      category: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      sourceKey: true,
    },
  });

  const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });

  const report = {
    generatedAt: new Date().toISOString(),
    officialSalesEuro: OFFICIAL_REVENUE_2026.grossEuro,
    rv: {
      n: rows.length,
      posEuro: euro(pos),
      negEuro: euro(neg),
      netEuro: euro(pos + neg),
      absEuro: euro(pos + Math.abs(neg)),
    },
    knownNegTarget: {
      expectedNegEuro: -2693.19,
      measuredNegEuro: euro(neg),
      bankNegEuro: euro(negBank.reduce((s, r) => s + r.totalCents, 0)),
      paypalNegEuro: euro(negPaypal.reduce((s, r) => s + r.totalCents, 0)),
      expectedBankUnclearEuro: -1070.15,
    },
    byNature: Object.fromEntries(
      Object.entries(byNature).map(([k, v]) => [
        k,
        {
          n: v.n,
          euroSigned: euro(v.euroSigned),
          euroAbs: euro(v.euroAbs),
          posEuro: euro(v.pos),
          negEuro: euro(v.neg),
          sample: v.rows.slice(0, 8),
          allIds: v.rows.map((r) => r.id),
        },
      ])
    ),
    contributo: contrib.map((c) => ({
      id: c.id,
      category: c.category,
      euro: euro(c.totalCents),
      date: c.accountingDate.toISOString().slice(0, 10),
      desc: c.description.slice(0, 160),
      sk: c.sourceKey,
    })),
    pnl: {
      venditeCaratteristicheEuro: euro((pnl as any).venditeCaratteristicheCents || 0),
      altriRicaviEuro: euro((pnl as any).altriRicaviCents || 0),
      contributiEuro: euro((pnl as any).contributiEsercizioCents || 0),
      ricaviLordiEuro: euro((pnl as any).ricaviLordiCents || 0),
      raiEuro: euro((pnl as any).risultatoAnteImposteCents || 0),
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        rv: report.rv,
        knownNeg: report.knownNegTarget,
        byNature: Object.fromEntries(
          Object.entries(report.byNature).map(([k, v]: any) => [
            k,
            { n: v.n, signed: v.euroSigned, abs: v.euroAbs, pos: v.posEuro, neg: v.negEuro },
          ])
        ),
        contributo: report.contributo,
        pnl: report.pnl,
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
