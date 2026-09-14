import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
import prisma from '@/lib/prisma';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import { buildTaxRegisterReport } from '@/lib/financial/taxRegister';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';

async function main() {
  const t3 = await buildTaxRegisterReport({ year: 2026, mode: 'quarter', quarter: 3 });
  const hit = t3.rows.filter(r => /FT-MC-26|Cesaroni|Rumori/i.test(`${r.orderNumber||''} ${r.customerName||''}`));
  console.log('taxRegister T3 isabella', JSON.stringify(hit.map(r => ({
    n: r.orderNumber, date: r.date, gross: (r.grossCents||0)/100, buyer: r.customerName,
  })), null, 2));

  const t2 = await buildTaxRegisterReport({ year: 2026, mode: 'quarter', quarter: 2 });
  const hit2 = t2.rows.filter(r => /FT-MC|Cesaroni|Rumori/i.test(`${r.orderNumber||''} ${r.customerName||''}`));
  console.log('taxRegister T2 isabella', hit2.length, hit2.map(r => ({ n: r.orderNumber, g: (r.grossCents||0)/100 })));

  const corr2 = await buildGatewayCorrispettivi({
    start: new Date('2026-04-01T00:00:00.000Z'),
    end: new Date('2026-06-30T23:59:59.999Z'),
  });
  const r284 = corr2.rows.filter(r => (r.grossCents||0) === 28490);
  console.log('corr T2 €284.90', r284.map(r => ({
    date: r.date, gross: (r.grossCents||0)/100, orderId: r.orderId, orderNumber: r.orderNumber,
    canale: r.canaleIncasso, class: (r as any).aliquotaClass ?? (r as any).vatClass ?? (r as any).classificazione,
    matched: !!(r.orderId),
  })));
  const noOrder = corr2.rows.filter(r => !r.orderId);
  console.log('T2 gateway no-order', noOrder.length, 'total rows', corr2.rows.length);

  const corr3 = await buildGatewayCorrispettivi({
    start: new Date('2026-07-01T00:00:00.000Z'),
    end: new Date('2026-09-30T23:59:59.999Z'),
  });
  const noOrder3 = corr3.rows.filter(r => !r.orderId);
  const posePrices = new Set([2590, 2999]);
  const overlap3 = noOrder3.filter(r => posePrices.has(r.grossCents||0));
  console.log('T3 gateway no-order', noOrder3.length, 'overlap 25.90/29.99', overlap3.length);

  const poseOrders = await prisma.order.findMany({
    where: { orderNumber: { in: ['FT-MC-26-003','FT-MC-26-004','FT-MC-26-005','FT-MC-26-006'] } },
    select: { id: true, orderNumber: true },
  });
  const openRicavi = await prisma.financialLedgerEntry.findMany({
    where: { orderId: { in: poseOrders.map(o => o.id) }, category: 'RICAVI_VENDITE', reversedAt: null },
  });
  console.log('open RICAVI on poses', openRicavi.length);

  const all = await prisma.order.findMany({
    where: {
      deletedAt: null, isTest: false, partnerPaymentStatus: 'PAID', stripeTransactionId: null,
      OR: [{ isRecurring: true }, { additionalInstructions: { contains: 'Duplicato da', mode: 'insensitive' } }],
    },
    select: {
      orderNumber: true, totalPriceCents: true, buyerEmail: true, createdAt: true,
      isRecurring: true, additionalInstructions: true, paymentMethodLabel: true, grossAmount: true, financeNotes: true,
    },
  });
  const filtered = all.filter(o => isPrepaidSubscriptionPoseOrder(o));
  console.log('GENERAL active partnerPAID poses noTX:', filtered.length);
  for (const o of filtered) {
    console.log(`  ${o.orderNumber} €${(o.totalPriceCents/100).toFixed(2)} ${o.buyerEmail} ${o.createdAt.toISOString().slice(0,10)}`);
  }

  // How many planned vs executed — notes say every last saturday until spring 2027
  const notes = await prisma.order.findFirst({
    where: { orderNumber: 'FT-MC-26-001' },
    select: { additionalInstructions: true, totalPriceCents: true, deletedAt: true, createdAt: true },
  });
  console.log('FT-MC-26-001 notes', notes);

  await prisma.$disconnect();
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
