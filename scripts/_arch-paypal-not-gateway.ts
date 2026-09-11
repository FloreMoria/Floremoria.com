/**
 * Architettura: Stripe = unico transito vendite; PayPal = conto pagamento;
 * fuori-gateway = contenitore separato. Misura + riclassifiche mirate.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { sumTransitLedgerCents } from '@/lib/financial/gatewayTransitBalance';
import {
    getStripeDeclaredBalance,
    getPaypalDeclaredBalance,
    setStripeDeclaredBalance,
    setPaypalDeclaredBalance,
} from '@/lib/financial/gatewayDeclaredBalance';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { OFFICIAL_REVENUE_2026 } from '@/lib/financial/officialRevenue2026';

const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-arch-stripe-only-paypal.json');
const OUT_MD = path.join(process.cwd(), 'docs/verbali/11-09-2026-arch-stripe-only-paypal.md');

const FINECO_STRIPE_PAYOUT = 287826; // cents
const FINECO_PAYPAL_CREDIT = 56988;
const STRIPE_DECLARED = 10000;
const PAYPAL_DECLARED = 0;
const OFFICIAL_SALES = Math.round(OFFICIAL_REVENUE_2026.grossEuro * 100); // 409868
const FEE_REF = 17849;

function euro(c: number) {
  return Math.round(c) / 100;
}

function metaAccount(m: unknown, side: 'dare' | 'avere') {
  const o = (m || {}) as Record<string, unknown>;
  return String(side === 'dare' ? o.dareAccount || '' : o.avereAccount || '');
}

function isStripeTransit(m: unknown) {
  const d = metaAccount(m, 'dare');
  const a = metaAccount(m, 'avere');
  return /10300|Banca c\/o Stripe|Conto Stripe/i.test(d + '|' + a);
}

function isPaypalTransit(m: unknown) {
  const d = metaAccount(m, 'dare');
  const a = metaAccount(m, 'avere');
  return /10200|Banca c\/o PayPal|Conto PayPal/i.test(d + '|' + a);
}

async function main() {
  const apply = process.env.APPLY === '1';

  // --- 1. Stripe legs by sourceKey prefix ---
  const stripeRows = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      OR: [
        { sourceKey: { startsWith: 'STRIPE_' } },
        { sourceKey: { startsWith: 'MANUAL_INBOUND:' } },
        { sourceKey: { startsWith: 'JSON_ENTRY:' } },
      ],
    },
    select: {
      id: true,
      sourceKey: true,
      sourceType: true,
      category: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      orderId: true,
      metadataJson: true,
      fiscalYear: true,
      entryNature: true,
    },
  });

  const legs = {
    tx2026: { n: 0, cents: 0, rows: [] as any[] },
    fee2026: { n: 0, cents: 0 },
    refund2026: { n: 0, cents: 0 },
    payout2026: { n: 0, cents: 0, rows: [] as any[] },
    manualInbound2026: { n: 0, cents: 0, rows: [] as any[] },
    jsonOnStripe2026: { n: 0, cents: 0 },
    otherStripe2026: { n: 0, cents: 0 },
  };

  for (const r of stripeRows) {
    if (r.fiscalYear !== 2026 && !r.sourceKey.startsWith('STRIPE_')) continue;
    const y = r.accountingDate.getUTCFullYear();
    const onStripe = isStripeTransit(r.metadataJson) || r.sourceKey.startsWith('STRIPE_');
    if (!onStripe && !r.sourceKey.startsWith('MANUAL_INBOUND:')) continue;

    const abs = Math.abs(r.totalCents);
    const sk = r.sourceKey;
    if (sk.startsWith('STRIPE_TX:') && y === 2026) {
      legs.tx2026.n++;
      legs.tx2026.cents += abs;
      legs.tx2026.rows.push({
        sk,
        euro: euro(abs),
        date: r.accountingDate.toISOString().slice(0, 10),
        orderId: r.orderId,
        cat: r.category,
      });
    } else if (sk.startsWith('STRIPE_FEE:') && y === 2026) {
      legs.fee2026.n++;
      legs.fee2026.cents += abs;
    } else if (sk.startsWith('STRIPE_REFUND:') && y === 2026) {
      legs.refund2026.n++;
      legs.refund2026.cents += abs;
    } else if (sk.startsWith('STRIPE_PAYOUT:') && y === 2026) {
      legs.payout2026.n++;
      legs.payout2026.cents += abs;
      legs.payout2026.rows.push({
        sk,
        euro: euro(abs),
        date: r.accountingDate.toISOString().slice(0, 10),
      });
    } else if (sk.startsWith('MANUAL_INBOUND:') && y === 2026) {
      legs.manualInbound2026.n++;
      legs.manualInbound2026.cents += abs;
      legs.manualInbound2026.rows.push({
        sk,
        euro: euro(abs),
        date: r.accountingDate.toISOString().slice(0, 10),
        orderId: r.orderId,
        cat: r.category,
        desc: (r.description || '').slice(0, 100),
        onStripeMeta: isStripeTransit(r.metadataJson),
      });
    } else if (sk.startsWith('JSON_ENTRY:') && y === 2026 && isStripeTransit(r.metadataJson)) {
      legs.jsonOnStripe2026.n++;
      legs.jsonOnStripe2026.cents += abs;
    } else if (sk.startsWith('STRIPE_') && y === 2026) {
      legs.otherStripe2026.n++;
      legs.otherStripe2026.cents += abs;
    }
  }

  const stripeLedgerAll = await sumTransitLedgerCents([
    '10300',
    'Banca c/o Stripe',
    'Conto Stripe',
  ]);

  // Equation with Fineco payout forced as reference (not ledger payout)
  const inboundGross = legs.tx2026.cents; // only STRIPE_TX — no MANUAL
  const fee = legs.fee2026.cents;
  const refund = legs.refund2026.cents;
  const payoutFineco = FINECO_STRIPE_PAYOUT;
  const payoutLedger = legs.payout2026.cents;
  const eqWithFineco = inboundGross - fee - refund - payoutFineco;
  const eqWithLedgerPayout = inboundGross - fee - refund - payoutLedger;
  // Including MANUAL into inbound (what inflated +3829)
  const inboundPlusManual = inboundGross + legs.manualInbound2026.cents;
  const eqInflated = inboundPlusManual - fee - refund - payoutFineco;

  // --- 2. PayPal ---
  const paypalRows = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      OR: [
        { sourceKey: { startsWith: 'PAYPAL_' } },
        { sourceType: 'PAYPAL_MOVEMENT' },
      ],
    },
    select: {
      id: true,
      sourceKey: true,
      category: true,
      totalCents: true,
      direction: true,
      accountingDate: true,
      description: true,
      orderId: true,
      metadataJson: true,
      entryNature: true,
    },
  });

  const pp = {
    txInboundOrder: [] as any[],
    txExpenseLike: [] as any[],
    fee: [] as any[],
    payout: [] as any[],
    refund: [] as any[],
    other: [] as any[],
  };
  for (const r of paypalRows) {
    const abs = Math.abs(r.totalCents);
    const row = {
      id: r.id,
      sk: r.sourceKey,
      euro: euro(abs),
      cents: abs,
      sign: r.totalCents,
      cat: r.category,
      dir: r.direction,
      date: r.accountingDate.toISOString().slice(0, 10),
      orderId: r.orderId,
      desc: (r.description || '').slice(0, 120),
      nature: r.entryNature,
      onPpMeta: isPaypalTransit(r.metadataJson),
    };
    if (r.sourceKey.startsWith('PAYPAL_TX:')) {
      const isSale =
        r.totalCents > 0 &&
        (r.orderId ||
          /Checkout|Acquisto Floremoria|Ordine FloreMoria/i.test(r.description || ''));
      const isExpense =
        r.totalCents < 0 ||
        /BALLARATE|POSTE|ORCHIDEA|MASPES|TRANSATEL|UBIGI|FACEBK|SDD|Add To Balance|canone|SaaS|Adobe|Google|Meta|OpenAI|Anthropic|Vercel|Cursor/i.test(
          r.description || ''
        );
      if (isSale && !isExpense) pp.txInboundOrder.push(row);
      else if (r.totalCents < 0 || isExpense) pp.txExpenseLike.push(row);
      else pp.other.push(row);
    } else if (r.sourceKey.startsWith('PAYPAL_FEE:')) pp.fee.push(row);
    else if (r.sourceKey.startsWith('PAYPAL_PAYOUT:')) pp.payout.push(row);
    else if (r.sourceKey.startsWith('PAYPAL_REFUND:')) pp.refund.push(row);
    else pp.other.push(row);
  }

  const sum = (arr: { cents: number }[]) => arr.reduce((s, r) => s + r.cents, 0);
  const paypalLedger = await sumTransitLedgerCents([
    '10200',
    'Banca c/o PayPal',
    'Conto PayPal',
  ]);

  // Spese PayPal in CE: category SPESE_SAAS / SPESE_OPERATIVE / etc with negative or expense
  const paypalCosts = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      sourceType: 'PAYPAL_MOVEMENT',
      category: {
        in: [
          'SPESE_SAAS',
          'SPESE_OPERATIVE',
          'ONERI_BANCARI',
          'CONSULENZE',
          'ALTRI_COSTI',
          'COSTI_FIORISTI',
          'IMPOSTE',
        ],
      },
    },
    select: { category: true, totalCents: true, description: true, sourceKey: true },
  });
  // Also RV negative wrongly reducing revenue
  const paypalNegRv = paypalRows.filter(
    (r) => r.category === 'RICAVI_VENDITE' && r.totalCents < 0
  );

  // --- 3. Altri ricavi ---
  const altri = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      category: 'ALTRI_RICAVI',
    },
    select: {
      id: true,
      sourceKey: true,
      sourceType: true,
      totalCents: true,
      accountingDate: true,
      description: true,
      counterpartyName: true,
      documentRef: true,
      bankLineId: true,
      metadataJson: true,
    },
    orderBy: { totalCents: 'desc' },
  });
  const altriSum = altri.reduce((s, r) => s + Math.abs(r.totalCents), 0);
  const top = altri[0];
  let bankLine: any = null;
  if (top?.bankLineId) {
    bankLine = await prisma.bankStatementLine.findUnique({
      where: { id: top.bankLineId },
      select: {
        id: true,
        valueDate: true,
        accountingDate: true,
        amountCents: true,
        description: true,
        rawJson: true,
        matchType: true,
        matchNotes: true,
      },
    });
  }

  // PnL before/after conceptually
  const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });

  // --- 4. Scarto residuo ---
  // Expected arrival ≈ sales - fees = 409868 - 17849 = 392019
  // Fineco stripe+paypal + stripe balance = 344814 + 10000 = 354814
  // Gap = 392019 - 354814 = 37205 (€372.05)
  const expectedNet = OFFICIAL_SALES - FEE_REF;
  const arrived = FINECO_STRIPE_PAYOUT + FINECO_PAYPAL_CREDIT + STRIPE_DECLARED;
  const gap = expectedNet - arrived;

  // Sept orders paid but not payout yet
  const listaPath = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');
  const raw = fs.readFileSync(listaPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0]!.split(';');
  const idx = (n: string) => h.indexOf(n);
  let t3Lista = 0;
  let septLista = 0;
  let allLista = 0;
  const septOrders: { id: string; euro: number }[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(';');
    const id = (c[idx('ID Ordine')] || '').trim();
    if (!id) continue;
    const price =
      Math.round(
        parseFloat((c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.') || '0') * 100
      ) || 0;
    if (price <= 0) continue;
    allLista += price;
    const ds = (c[idx('Data')] || '').trim();
    const m = ds.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) continue;
    const month = +m[2]!;
    if (month >= 7 && month <= 9) t3Lista += price;
    if (month === 9) {
      septLista += price;
      septOrders.push({ id, euro: euro(price) });
    }
  }

  // Stripe Fineco T3 credits from user: 1320.33; T3 orders 1849.42 → unpaid to Fineco ~529
  const finecoStripeT3 = 132033;
  const t3NotYetPaidOut = Math.max(0, t3Lista - finecoStripeT3); // crude: orders T3 vs Fineco stripe T3

  // Real fees from STRIPE_FEE
  const feeDelta = fee - FEE_REF;

  // Orders paid outside Stripe = MANUAL_INBOUND + eu without stripe + PAYPAL native (but architecture says PayPal is via Stripe)
  // Count lista orders without STRIPE_TX link
  const orders = await prisma.order.findMany({
    where: { deletedAt: null, isTest: false },
    select: {
      id: true,
      orderNumber: true,
      grossAmount: true,
      stripeTransactionId: true,
      createdAt: true,
      status: true,
    },
  });
  // Match lista ids
  const listaIds = new Set<string>();
  const listaById = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const c = line.split(';');
    const id = (c[idx('ID Ordine')] || '').trim();
    if (!id) continue;
    const price =
      Math.round(
        parseFloat((c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.') || '0') * 100
      ) || 0;
    if (price <= 0) continue;
    listaIds.add(id);
    listaById.set(id, price);
  }
  const stripeTxOrderIds = new Set(
    stripeRows.filter((r) => r.sourceKey.startsWith('STRIPE_TX:') && r.orderId).map((r) => r.orderId!)
  );
  let outsideStripeCents = 0;
  let outsideStripeN = 0;
  const outsideRows: any[] = [];
  for (const o of orders) {
    if (!o.orderNumber || !listaIds.has(o.orderNumber)) continue;
    const hasStripe =
      stripeTxOrderIds.has(o.id) ||
      !!(o.stripeTransactionId && o.stripeTransactionId.length > 4);
    if (!hasStripe) {
      const cents = listaById.get(o.orderNumber) || 0;
      outsideStripeCents += cents;
      outsideStripeN++;
      outsideRows.push({ id: o.orderNumber, euro: euro(cents), stripeTx: o.stripeTransactionId });
    }
  }

  // Fee in CE?
  const feeEntries = await prisma.financialLedgerEntry.findMany({
    where: {
      reversedAt: null,
      fiscalYear: 2026,
      sourceKey: { startsWith: 'STRIPE_FEE:' },
    },
    select: { category: true, totalCents: true, entryNature: true },
  });
  const feeByCat: Record<string, number> = {};
  for (const f of feeEntries) {
    feeByCat[f.category] = (feeByCat[f.category] || 0) + Math.abs(f.totalCents);
  }

  const declStripe = await getStripeDeclaredBalance();
  const declPaypal = await getPaypalDeclaredBalance();

  // APPLY: reclass PayPal inbound order sales out of sales transit identity
  const applyLog: any[] = [];
  if (apply) {
    // 1) Ensure declared balances
    await setStripeDeclaredBalance({
      balanceCents: STRIPE_DECLARED,
      asOf: '2026-09-11',
      note: 'Dichiarato utente — architettura Stripe-only transit',
    });
    await setPaypalDeclaredBalance({
      balanceCents: PAYPAL_DECLARED,
      asOf: '2026-09-11',
      note: 'Conto pagamento (non transito vendite)',
    });
    applyLog.push({ setDeclared: { stripe: 100, paypal: 0 } });

    // 2) Remove PAYPAL_TX order-linked / checkout from RICAVI_VENDITE transit role:
    //    - clear orderId link for architecture (or move category)
    //    User: "azzera lì ogni inbound da ordine"
    //    → reverse or reclassify PAYPAL_TX that look like customer sales to non-revenue
    //    Better: set category to TRASFERIMENTO_INTERNO or exclude from CE, and strip orderId
    //    Actually: if PayPal is not sales gateway, those TX shouldn't be RICAVI_VENDITE at all
    //    (Stripe already has the charge). So reverse/reclass sales-like PAYPAL_TX to
    //    a non-economic holding OR mark as duplicate of Stripe.
    //
    //    Conservative apply: for PAYPAL_TX with orderId OR checkout description AND totalCents>0:
    //    category → DA_CLASSIFICARE or keep but set entryNature and remove from transit meta;
    //    clear orderId; change metadata dare/avere away from "sales".
    //
    //    Stronger (user asked): azzera inbound da ordine → reverse those entries (reversedAt)
    //    OR reclass to TRASFERIMENTO_INTERNO with note ARCH_PAYPAL_NOT_GATEWAY.

    for (const row of [...pp.txInboundOrder]) {
      const meta = ((await prisma.financialLedgerEntry.findUnique({
        where: { id: row.id },
        select: { metadataJson: true },
      }))?.metadataJson || {}) as Record<string, unknown>;
      await prisma.financialLedgerEntry.update({
        where: { id: row.id },
        data: {
          category: 'TRASFERIMENTO_INTERNO',
          orderId: null,
          entryNature: 'FINANZIARIA',
          description: `[ARCH_PAYPAL_NOT_GATEWAY] ex inbound vendite — ${row.desc}`.slice(0, 500),
          metadataJson: {
            ...meta,
            archPaypalNotGateway: true,
            previousCategory: row.cat,
            previousOrderId: row.orderId,
            // Keep PayPal account but not as sales transit counterpart of revenue
            dareAccount: meta.dareAccount || '10200 Banca c/o PayPal',
            avereAccount: '99999 Clearing architettura PayPal non-gateway',
          },
        },
      });
      applyLog.push({ reclassPaypalInbound: row.sk, euro: row.euro });
    }

    // 3) Expense-like PAYPAL_TX still in RICAVI_VENDITE → move to SPESE_SAAS / ALTRI_COSTI
    for (const row of pp.txExpenseLike) {
      if (row.cat !== 'RICAVI_VENDITE' && row.cat !== 'ALTRI_RICAVI') continue;
      const isSaas = /TRANSATEL|UBIGI|FACEBK|Adobe|Google|Meta|OpenAI|Vercel|Cursor|SaaS/i.test(
        row.desc
      );
      const newCat = isSaas ? 'SPESE_SAAS' : 'SPESE_OPERATIVE';
      const meta = ((await prisma.financialLedgerEntry.findUnique({
        where: { id: row.id },
        select: { metadataJson: true },
      }))?.metadataJson || {}) as Record<string, unknown>;
      await prisma.financialLedgerEntry.update({
        where: { id: row.id },
        data: {
          category: newCat,
          direction: 'USCITA',
          totalCents: -Math.abs(row.cents),
          netCents: -Math.abs(row.cents),
          entryNature: 'ECONOMICA',
          description: `[ARCH_PAYPAL_COST] ${row.desc}`.slice(0, 500),
          metadataJson: {
            ...meta,
            archPaypalCostFromRv: true,
            previousCategory: row.cat,
            dareAccount: newCat === 'SPESE_SAAS' ? '61000 Spese SaaS' : '62000 Spese operative',
            avereAccount: '10200 Banca c/o PayPal',
          },
        },
      });
      applyLog.push({ reclassPaypalCost: row.sk, euro: row.euro, newCat });
    }

    // 4) MANUAL_INBOUND that hits Stripe transit meta → move off Stripe transit
    for (const row of legs.manualInbound2026.rows) {
      if (!row.onStripeMeta) continue;
      const full = await prisma.financialLedgerEntry.findUnique({
        where: { id: undefined as any },
      }).catch(() => null);
    }
    // Fix MANUAL_INBOUND by sourceKey
    const manuals = await prisma.financialLedgerEntry.findMany({
      where: {
        reversedAt: null,
        fiscalYear: 2026,
        sourceKey: { startsWith: 'MANUAL_INBOUND:' },
      },
    });
    for (const r of manuals) {
      if (!isStripeTransit(r.metadataJson)) continue;
      const meta = (r.metadataJson || {}) as Record<string, unknown>;
      await prisma.financialLedgerEntry.update({
        where: { id: r.id },
        data: {
          entryNature: 'FINANZIARIA',
          description: `[FUORI_GATEWAY] ${r.description || ''}`.slice(0, 500),
          metadataJson: {
            ...meta,
            fuoriGateway: true,
            previousDare: meta.dareAccount,
            previousAvere: meta.avereAccount,
            dareAccount: '10400 Crediti / Incassi fuori gateway',
            avereAccount: ACCOUNT_RICAVI_SAFE(meta),
          },
        },
      });
      applyLog.push({ fuoriGateway: r.sourceKey, euro: euro(Math.abs(r.totalCents)) });
    }
  }

  function ACCOUNT_RICAVI_SAFE(meta: Record<string, unknown>) {
    return String(meta.avereAccount || '40000 Ricavi vendite');
  }

  // Re-measure after apply
  const stripeLedgerAfter = apply
    ? await sumTransitLedgerCents(['10300', 'Banca c/o Stripe', 'Conto Stripe'])
    : stripeLedgerAll;
  const paypalLedgerAfter = apply
    ? await sumTransitLedgerCents(['10200', 'Banca c/o PayPal', 'Conto PayPal'])
    : paypalLedger;

  // Recompute stripe TX after apply for equation
  let txAfter = legs.tx2026.cents;
  let feeAfter = fee;
  let refundAfter = refund;
  let manualAfter = 0;
  if (apply) {
    const tx = await prisma.financialLedgerEntry.aggregate({
      where: {
        reversedAt: null,
        fiscalYear: 2026,
        sourceKey: { startsWith: 'STRIPE_TX:' },
      },
      _sum: { totalCents: true },
      _count: true,
    });
    txAfter = Math.abs(tx._sum.totalCents || 0);
    const manuals2 = await prisma.financialLedgerEntry.findMany({
      where: {
        reversedAt: null,
        fiscalYear: 2026,
        sourceKey: { startsWith: 'MANUAL_INBOUND:' },
      },
      select: { totalCents: true, metadataJson: true },
    });
    manualAfter = manuals2
      .filter((r) => isStripeTransit(r.metadataJson))
      .reduce((s, r) => s + Math.abs(r.totalCents), 0);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    applyLog: applyLog.slice(0, 200),
    applyLogN: applyLog.length,
    finecoRef: {
      stripePayoutEuro: euro(FINECO_STRIPE_PAYOUT),
      paypalCreditEuro: euro(FINECO_PAYPAL_CREDIT),
      totalEuro: euro(FINECO_STRIPE_PAYOUT + FINECO_PAYPAL_CREDIT),
      stripeT1: 466.89,
      stripeT2: 1091.04,
      stripeT3: 1320.33,
      paypalT1: 324.37,
      paypalT2: 170.41,
      paypalT3: 75.1,
    },
    punto1_stripeTransit: {
      addendi: {
        incassiCliente_STRIPE_TX: { n: legs.tx2026.n, euro: euro(legs.tx2026.cents) },
        commissioni_STRIPE_FEE: { n: legs.fee2026.n, euro: euro(fee) },
        rimborsi_STRIPE_REFUND: { n: legs.refund2026.n, euro: euro(refund) },
        payout_ledger_po: { n: legs.payout2026.n, euro: euro(payoutLedger) },
        payout_Fineco_riferimento: { euro: euro(payoutFineco) },
      },
      equazione_con_payout_Fineco: {
        formula: 'TX − FEE − REFUND − Fineco_payout',
        resultEuro: euro(eqWithFineco),
        attesoEuro: euro(STRIPE_DECLARED),
        deltaVs100Euro: euro(eqWithFineco - STRIPE_DECLARED),
      },
      equazione_con_payout_ledger: {
        resultEuro: euro(eqWithLedgerPayout),
        deltaVs100Euro: euro(eqWithLedgerPayout - STRIPE_DECLARED),
      },
      cosaGonfiava: {
        MANUAL_INBOUND_su_meta_stripe: {
          n: legs.manualInbound2026.n,
          euro: euro(legs.manualInbound2026.cents),
          rows: legs.manualInbound2026.rows,
        },
        JSON_ENTRY_su_stripe: {
          n: legs.jsonOnStripe2026.n,
          euro: euro(legs.jsonOnStripe2026.cents),
        },
        equazione_gonfiata_TX_plus_MANUAL: {
          resultEuro: euro(eqInflated),
          deltaVs100Euro: euro(eqInflated - STRIPE_DECLARED),
        },
      },
      ledgerTransitAllTimeEuro: euro(stripeLedgerAll),
      ledgerTransitAfterEuro: euro(stripeLedgerAfter),
      payoutDelta_ledger_vs_Fineco: euro(payoutLedger - payoutFineco),
      fuori: null as any,
    },
    punto2_paypal: {
      inboundVenditeDaAzzerare: {
        n: pp.txInboundOrder.length,
        euro: euro(sum(pp.txInboundOrder)),
        sample: pp.txInboundOrder.slice(0, 15),
      },
      expenseLikeAncoraInRvODubbio: {
        n: pp.txExpenseLike.length,
        euro: euro(sum(pp.txExpenseLike)),
        sample: pp.txExpenseLike.slice(0, 20),
      },
      payoutLedger: { n: pp.payout.length, euro: euro(sum(pp.payout)) },
      payoutFinecoRef: euro(FINECO_PAYPAL_CREDIT),
      costiGiaInCe: {
        n: paypalCosts.length,
        euro: euro(paypalCosts.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        byCat: paypalCosts.reduce((acc: any, r) => {
          acc[r.category] = (acc[r.category] || 0) + Math.abs(r.totalCents);
          return acc;
        }, {}),
      },
      negativiInRicaviVendite: {
        n: paypalNegRv.length,
        euro: euro(paypalNegRv.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
      },
      ledgerTransitEuro: euro(paypalLedger),
      ledgerTransitAfterEuro: euro(paypalLedgerAfter),
    },
    punto3_altriRicavi: {
      n: altri.length,
      euro: euro(altriSum),
      top: top
        ? {
            date: top.accountingDate.toISOString().slice(0, 10),
            euro: euro(Math.abs(top.totalCents)),
            description: top.description,
            counterparty: top.counterpartyName,
            sourceKey: top.sourceKey,
            sourceType: top.sourceType,
            bankLine,
          }
        : null,
      all: altri.map((r) => ({
        date: r.accountingDate.toISOString().slice(0, 10),
        euro: euro(Math.abs(r.totalCents)),
        desc: (r.description || '').slice(0, 120),
        cp: r.counterpartyName,
        sk: r.sourceKey,
      })),
      pnlAltriRicaviEuro: euro((pnl as any).altriRicaviCents || 0),
      pnlVenditeEuro: euro((pnl as any).venditeCaratteristicheCents || 0),
      pnlRaiEuro: euro((pnl as any).risultatoAnteImposteCents || 0),
    },
    punto4_scarto: {
      venditeOfficialEuro: euro(OFFICIAL_SALES),
      feeRefEuro: euro(FEE_REF),
      expectedNetEuro: euro(expectedNet),
      finecoPlusSaldoEuro: euro(arrived),
      gapEuro: euro(gap),
      a_settembreNonVersato: {
        septListaEuro: euro(septLista),
        t3ListaEuro: euro(t3Lista),
        finecoStripeT3Euro: euro(finecoStripeT3),
        t3OrdiniMenoFinecoStripeEuro: euro(t3NotYetPaidOut),
        note: 'Proxy: T3 lista − giroconti Stripe Fineco T3 (non è 1:1 con pending Stripe)',
        septOrders,
      },
      b_commissioniRealSuperiori: {
        feeLedgerEuro: euro(fee),
        feeRefEuro: euro(FEE_REF),
        deltaEuro: euro(feeDelta),
      },
      c_ordiniFuoriStripe: {
        n: outsideStripeN,
        euro: euro(outsideStripeCents),
        rows: outsideRows,
      },
    },
    punto6_feeInCe: {
      feeByCategoryCents: feeByCat,
      feeByCategoryEuro: Object.fromEntries(
        Object.entries(feeByCat).map(([k, v]) => [k, euro(v as number)])
      ),
      inCe:
        Object.keys(feeByCat).some((k) =>
          /COMMISSIONI|ONERI|SPESE|COSTI/i.test(k)
        ) || feeEntries.some((f) => f.category !== 'RICAVI_VENDITE'),
    },
    declared: { before: { stripe: declStripe, paypal: declPaypal } },
    afterApplyEq: apply
      ? {
          txEuro: euro(txAfter),
          feeEuro: euro(feeAfter),
          refundEuro: euro(refundAfter),
          manualStillOnStripeEuro: euro(manualAfter),
          eqFineco: euro(txAfter - feeAfter - refundAfter - payoutFineco),
        }
      : null,
  };

  // Identify which addend is off
  const delta = report.punto1_stripeTransit.equazione_con_payout_Fineco.deltaVs100Euro;
  const candidates = [
    {
      name: 'incassiCliente_STRIPE_TX',
      euro: report.punto1_stripeTransit.addendi.incassiCliente_STRIPE_TX.euro,
      note: 'se troppo alti: includono non-vendite o doppi; se bassi: manca TX',
    },
    {
      name: 'commissioni',
      euro: report.punto1_stripeTransit.addendi.commissioni_STRIPE_FEE.euro,
    },
    {
      name: 'rimborsi',
      euro: report.punto1_stripeTransit.addendi.rimborsi_STRIPE_REFUND.euro,
    },
    {
      name: 'payout_ledger_vs_Fineco',
      euro: report.punto1_stripeTransit.payoutDelta_ledger_vs_Fineco,
    },
    {
      name: 'MANUAL_INBOUND_era_nel_transito',
      euro: report.punto1_stripeTransit.cosaGonfiava.MANUAL_INBOUND_su_meta_stripe.euro,
    },
  ];
  report.punto1_stripeTransit.fuori = {
    deltaVs100Euro: delta,
    interpretazione:
      delta > 0
        ? `Transito calcolati €${delta} sopra i €100 — troppi inbound e/o pochi outflow`
        : `Transito calcolati €${Math.abs(delta)} sotto i €100 — pochi inbound e/o troppi outflow`,
    candidati: candidates,
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        apply,
        p1: report.punto1_stripeTransit,
        p2: {
          inbound: report.punto2_paypal.inboundVenditeDaAzzerare,
          expense: {
            n: report.punto2_paypal.expenseLikeAncoraInRvODubbio.n,
            euro: report.punto2_paypal.expenseLikeAncoraInRvODubbio.euro,
          },
          costiCe: report.punto2_paypal.costiGiaInCe,
          negRv: report.punto2_paypal.negativiInRicaviVendite,
          payout: report.punto2_paypal.payoutLedger,
        },
        p3: report.punto3_altriRicavi,
        p4: report.punto4_scarto,
        p6: report.punto6_feeInCe,
        after: report.afterApplyEq,
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
