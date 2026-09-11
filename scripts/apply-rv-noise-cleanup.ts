/**
 * Pulizia rumore RICAVI_VENDITE 2026 + verifica contributo CCIAA / IVA.
 * APPLY=1 per scrivere.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { OFFICIAL_REVENUE_2026 } from '@/lib/financial/officialRevenue2026';

const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-rv-noise-cleanup.json');
const BATCH = 'RV_NOISE_CLEANUP_20260911';

function euro(c: number) {
  return Math.round(c) / 100;
}

async function main() {
  const apply = process.env.APPLY === '1';
  const log: any[] = [];

  const pnlBefore = await computeHistoricalPnl({ fiscalYear: 2026 });

  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    select: { id: true, orderNumber: true },
  });
  const onById = new Map(orders.map((o) => [o.id, o.orderNumber || '']));
  const idByOn = new Map(orders.map((o) => [o.orderNumber || '', o.id]));

  const rv = await prisma.financialLedgerEntry.findMany({
    where: { reversedAt: null, fiscalYear: 2026, category: 'RICAVI_VENDITE' },
  });

  // Coverage sets: orderNumbers that have STRIPE_TX or MANUAL_INBOUND
  const coveredOn = new Set<string>();
  for (const r of rv) {
    if (r.totalCents <= 0) continue;
    if (r.sourceKey.startsWith('MANUAL_INBOUND:') && r.orderId) {
      const on = onById.get(r.orderId);
      if (on) coveredOn.add(on);
    }
  }
  // Stripe TX: match description / link orderId / amount+date later
  const stripeTx = rv.filter((r) => r.sourceKey.startsWith('STRIPE_TX:') && r.totalCents > 0);
  for (const r of stripeTx) {
    if (r.orderId) {
      const on = onById.get(r.orderId);
      if (on) coveredOn.add(on);
    }
  }

  // Also: any non-RV STRIPE_TX
  const stripeAll = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      sourceKey: { startsWith: 'STRIPE_TX:' },
      totalCents: { gt: 0 },
    },
    select: { orderId: true, description: true, sourceKey: true },
  });
  for (const r of stripeAll) {
    if (r.orderId) {
      const on = onById.get(r.orderId);
      if (on) coveredOn.add(on);
    }
  }

  type Action = {
    id: string;
    from: string;
    to: string;
    euro: number;
    nature: string;
    reason: string;
    desc: string;
  };
  const actions: Action[] = [];

  for (const r of rv) {
    const desc = r.description || '';
    const meta = (r.metadataJson || {}) as Record<string, unknown>;
    const abs = Math.abs(r.totalCents);

    // --- Negativi: SDD PayPal / spese in RV ---
    if (r.totalCents < 0) {
      if (/Addebito Sdd|Add To Balance|Paypal Europe/i.test(desc)) {
        actions.push({
          id: r.id,
          from: 'RICAVI_VENDITE',
          to: 'TRASFERIMENTO_INTERNO',
          euro: euro(r.totalCents),
          nature: 'paypal_sdd_ricarica',
          reason: 'SDD PayPal = ricarica wallet / partita di giro, non ricavo',
          desc: desc.slice(0, 120),
        });
        continue;
      }
      if (/POSTE|BALLARATE|TRANSATEL|UBIGI|FACEBK|ORCHIDEA|MASPES/i.test(desc)) {
        const to = /TRANSATEL|UBIGI|FACEBK|SaaS/i.test(desc) ? 'SPESE_SAAS' : 'SPESE_OPERATIVE';
        actions.push({
          id: r.id,
          from: 'RICAVI_VENDITE',
          to,
          euro: euro(r.totalCents),
          nature: 'spesa',
          reason: 'spesa classata in ricavi',
          desc: desc.slice(0, 120),
        });
        continue;
      }
      if (/fiorist|Battistella|floricol|EREDI|BENDA/i.test(desc)) {
        actions.push({
          id: r.id,
          from: 'RICAVI_VENDITE',
          to: 'COSTI_FIORISTI',
          euro: euro(r.totalCents),
          nature: 'movimento_fiorista',
          reason: 'pagamento fiorista in ricavi',
          desc: desc.slice(0, 120),
        });
        continue;
      }
      // residual negatives
      actions.push({
        id: r.id,
        from: 'RICAVI_VENDITE',
        to: 'DA_CLASSIFICARE',
        euro: euro(r.totalCents),
        nature: 'bank_negativo_non_chiarito',
        reason: 'negativo in RV non identificato',
        desc: desc.slice(0, 120),
      });
      continue;
    }

    // --- Cashback ---
    if (/cashback/i.test(desc)) {
      actions.push({
        id: r.id,
        from: 'RICAVI_VENDITE',
        to: 'ALTRI_RICAVI',
        euro: euro(r.totalCents),
        nature: 'cashback_sopravvenienza',
        reason: 'cashback → sopravvenienza / altri ricavi',
        desc: desc.slice(0, 120),
      });
      continue;
    }

    // --- JSON_ENTRY doubles ---
    if (r.sourceKey.startsWith('JSON_ENTRY:')) {
      const m = desc.match(/\bOrdine\s+((?:FT|FF)-[A-Z0-9-]+)\b/i);
      const on = m?.[1]?.toUpperCase() || null;
      if (on && coveredOn.has(on)) {
        actions.push({
          id: r.id,
          from: 'RICAVI_VENDITE',
          to: 'TRASFERIMENTO_INTERNO',
          euro: euro(r.totalCents),
          nature: 'json_doppio',
          reason: `JSON duplica ordine ${on} già coperto da Stripe/MANUAL`,
          desc: desc.slice(0, 120),
        });
      } else if (on) {
        // Check STRIPE_TX coverage by matching order via stripe link or amount
        const oid = idByOn.get(on);
        const hasStripe = oid
          ? stripeAll.some((x) => x.orderId === oid)
          : false;
        // Stripe JSON "Incasso lordo clienti tramite Stripe" → duplicate of STRIPE_TX
        const isStripeJson = /tramite Stripe/i.test(desc);
        if (hasStripe || isStripeJson) {
          actions.push({
            id: r.id,
            from: 'RICAVI_VENDITE',
            to: 'TRASFERIMENTO_INTERNO',
            euro: euro(r.totalCents),
            nature: 'json_doppio',
            reason: isStripeJson
              ? `JSON Stripe duplica STRIPE_TX per ${on}`
              : `JSON duplica STRIPE_TX linked a ${on}`,
            desc: desc.slice(0, 120),
          });
        } else {
          actions.push({
            id: r.id,
            from: 'RICAVI_VENDITE',
            to: 'RICAVI_VENDITE',
            euro: euro(r.totalCents),
            nature: 'json_unico_keep',
            reason: `JSON unica copertura per ${on} — resta ricavo, si collega orderId`,
            desc: desc.slice(0, 120),
          });
        }
      } else {
        actions.push({
          id: r.id,
          from: 'RICAVI_VENDITE',
          to: 'DA_CLASSIFICARE',
          euro: euro(r.totalCents),
          nature: 'json_orfano',
          reason: 'JSON senza ordine FT-/FF- riconoscibile',
          desc: desc.slice(0, 120),
        });
      }
      continue;
    }
  }

  // Also: bank negatives historically in −2693 that are still in wrong CE as reducing nothing
  // Re-scan BANK_LINE negatives that look like florist but in SPESE_OPERATIVE
  const floristMis = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      sourceKey: { startsWith: 'BANK_LINE:' },
      totalCents: { lt: 0 },
      category: 'SPESE_OPERATIVE',
      OR: [
        { description: { contains: 'Battistella', mode: 'insensitive' } },
        { description: { contains: 'fiorist', mode: 'insensitive' } },
        { description: { contains: 'Fioreria', mode: 'insensitive' } },
      ],
    },
  });
  for (const r of floristMis) {
    actions.push({
      id: r.id,
      from: r.category,
      to: 'COSTI_FIORISTI',
      euro: euro(r.totalCents),
      nature: 'movimento_fiorista',
      reason: 'bonifico fiorista era in spese operative',
      desc: (r.description || '').slice(0, 120),
    });
  }

  // Ensure contribution is ALTRI_RICAVI path? User wants "Altri ricavi e proventi"
  // Keep CONTRIBUTI_ESERCIZIO (already separate from vendite) but add display flag.
  // Optionally also set a metadata nature. User: "Va in Altri ricavi e proventi"
  // We'll keep category CONTRIBUTI_ESERCIZIO (correct Italian CE voice) which PnL already
  // separates; ensure label "Contributi / altri ricavi e proventi".

  const contrib = await prisma.financialLedgerEntry.findFirst({
    where: { reversedAt: null, totalCents: 459766, fiscalYear: 2026 },
  });

  // IVA: corrispettivi containing 4597.66 or CCIAA
  const start = new Date('2026-01-01T00:00:00.000Z');
  const end = new Date('2026-12-31T23:59:59.999Z');
  const gw = await buildGatewayCorrispettivi({ start, end });
  const corrHit = gw.rows.filter(
    (r) =>
      Math.abs(r.grossCents) === 459766 ||
      /Cciaa|CCIAA|Bando Nuova Impresa|Iconto/i.test(
        `${(r as any).orderNumber || ''} ${r.transactionId || ''}`
      )
  );

  // Summarize actions
  const byNature: Record<string, { n: number; euro: number }> = {};
  for (const a of actions) {
    byNature[a.nature] = byNature[a.nature] || { n: 0, euro: 0 };
    byNature[a.nature].n++;
    byNature[a.nature].euro = Math.round((byNature[a.nature].euro + a.euro) * 100) / 100;
  }

  if (apply) {
    for (const a of actions) {
      if (a.to === 'RICAVI_VENDITE' && a.nature === 'json_unico_keep') {
        const m = a.desc.match(/\bOrdine\s+((?:FT|FF)-[A-Z0-9-]+)\b/i);
        const on = m?.[1]?.toUpperCase();
        const oid = on ? idByOn.get(on) : null;
        const row = await prisma.financialLedgerEntry.findUnique({ where: { id: a.id } });
        const meta = ((row?.metadataJson || {}) as Record<string, unknown>) || {};
        await prisma.financialLedgerEntry.update({
          where: { id: a.id },
          data: {
            orderId: oid || row?.orderId,
            metadataJson: {
              ...meta,
              rvNoiseBatch: BATCH,
              rvNoiseNature: a.nature,
            },
          },
        });
        continue;
      }
      if (a.from === a.to) continue;
      const row = await prisma.financialLedgerEntry.findUnique({ where: { id: a.id } });
      if (!row) continue;
      const meta = (row.metadataJson || {}) as Record<string, unknown>;
      const abs = Math.abs(row.totalCents);
      const isCost = [
        'SPESE_SAAS',
        'SPESE_OPERATIVE',
        'COSTI_FIORISTI',
        'ONERI_BANCARI',
        'ALTRI_COSTI',
      ].includes(a.to);
      await prisma.financialLedgerEntry.update({
        where: { id: a.id },
        data: {
          category: a.to,
          direction: isCost || row.totalCents < 0 ? 'USCITA' : row.direction,
          totalCents: isCost ? -abs : a.to === 'ALTRI_RICAVI' ? abs : row.totalCents,
          netCents: isCost ? -abs : a.to === 'ALTRI_RICAVI' ? abs : row.netCents,
          entryNature:
            a.to === 'TRASFERIMENTO_INTERNO'
              ? 'FINANZIARIA'
              : a.to === 'ALTRI_RICAVI'
                ? 'ECONOMICA'
                : isCost
                  ? 'ECONOMICA'
                  : row.entryNature,
          description: `[${BATCH}] ${row.description || ''}`.slice(0, 500),
          metadataJson: {
            ...meta,
            rvNoiseBatch: BATCH,
            rvNoiseNature: a.nature,
            previousCategory: a.from,
            rvNoiseReason: a.reason,
          },
        },
      });
    }

    // Tag contribution for UI
    if (contrib) {
      const meta = (contrib.metadataJson || {}) as Record<string, unknown>;
      await prisma.financialLedgerEntry.update({
        where: { id: contrib.id },
        data: {
          category: 'CONTRIBUTI_ESERCIZIO',
          metadataJson: {
            ...meta,
            natureLabel: 'Altri ricavi e proventi — contributo pubblico',
            contributoPubblico: true,
            bando: 'Nuova Impresa 2025',
            ente: 'CCIAA Como-Lecco',
            fuoriCampoIva: true,
            nonVendita: true,
          },
          description:
            'Contributo pubblico CCIAA Como-Lecco — Liquidazione Bando Nuova Impresa 2025 (fuori campo IVA, non vendita)',
        },
      });
    }
  }

  const pnlAfter = await computeHistoricalPnl({ fiscalYear: 2026 });
  const contribCents = (pnlAfter as any).contributiEsercizioCents || 0;

  // Remaining RV positives
  const rvAfter = await prisma.financialLedgerEntry.findMany({
    where: { reversedAt: null, fiscalYear: 2026, category: 'RICAVI_VENDITE', totalCents: { gt: 0 } },
    select: { totalCents: true, sourceKey: true },
  });
  const rvPosAfter = rvAfter.reduce((s, r) => s + r.totalCents, 0);
  const rvBySrc: Record<string, number> = {};
  for (const r of rvAfter) {
    const k = r.sourceKey.split(':')[0] || 'x';
    rvBySrc[k] = (rvBySrc[k] || 0) + r.totalCents;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    officialSalesEuro: OFFICIAL_REVENUE_2026.grossEuro,
    actionsN: actions.length,
    byNature,
    actions: actions.slice(0, 200),
    contributo: {
      id: contrib?.id,
      category: 'CONTRIBUTI_ESERCIZIO',
      euro: 4597.66,
      inCe: true,
      inVendite: false,
      raiBeforeWithContrib: euro((pnlBefore as any).risultatoAnteImposteCents),
      raiBeforeWithoutContrib: euro(
        (pnlBefore as any).risultatoAnteImposteCents - ((pnlBefore as any).contributiEsercizioCents || 0)
      ),
      // User freeze −3764.48: that figure already included contrib
      freezeRai376448_includesContributo: true,
      corrispettiviHits: corrHit.length,
      ivaErrataEuro: euro(corrHit.reduce((s, r) => s + (r.ivaCents || 0), 0)),
      corrSample: corrHit.slice(0, 3),
    },
    pnl: {
      before: {
        vendite: euro((pnlBefore as any).venditeCaratteristicheCents),
        altri: euro((pnlBefore as any).altriRicaviCents),
        contributi: euro((pnlBefore as any).contributiEsercizioCents || 0),
        ricaviLordi: euro((pnlBefore as any).ricaviLordiCents),
        rai: euro((pnlBefore as any).risultatoAnteImposteCents),
      },
      after: {
        vendite: euro((pnlAfter as any).venditeCaratteristicheCents),
        altri: euro((pnlAfter as any).altriRicaviCents),
        contributi: euro(contribCents),
        ricaviLordi: euro((pnlAfter as any).ricaviLordiCents),
        rai: euro((pnlAfter as any).risultatoAnteImposteCents),
        raiSenzaContributo: euro((pnlAfter as any).risultatoAnteImposteCents - contribCents),
      },
    },
    rvPosAfter: {
      euro: euro(rvPosAfter),
      vsOfficial: euro(rvPosAfter - Math.round(OFFICIAL_REVENUE_2026.grossEuro * 100)),
      bySrc: Object.fromEntries(Object.entries(rvBySrc).map(([k, v]) => [k, euro(v)])),
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
