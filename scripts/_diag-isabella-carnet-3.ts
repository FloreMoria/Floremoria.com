import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
import prisma from '@/lib/prisma';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import { buildTaxRegisterReport } from '@/lib/financial/taxRegister';
import { buildCorrispettiviSheet } from '@/lib/financial/dossierCorrispettiviBuild';

async function main() {
  const poseIds = ['cmr3cfnah0','cmr3hrlmg0','cmr9cbwna0','cmsdhds970']; // approximate - look up
  const poses = await prisma.order.findMany({
    where: {
      orderNumber: { in: ['FT-MC-26-003','FT-MC-26-004','FT-MC-26-005','FT-MC-26-006'] },
    },
    select: { id: true, orderNumber: true, createdAt: true, totalPriceCents: true, partnerPaymentStatus: true, isRecurring: true, stripeTransactionId: true, additionalInstructions: true, financeNotes: true, paymentMethodLabel: true, grossAmount: true },
  });
  console.log('poses', poses.map(p => ({ n: p.orderNumber, id: p.id, pose: isPrepaidSubscriptionPoseOrder(p) })));

  // Tax register with proper ISO dates
  for (const [label, start, end] of [
    ['T2', new Date('2026-04-01T00:00:00.000Z'), new Date('2026-06-30T23:59:59.999Z')],
    ['T3', new Date('2026-07-01T00:00:00.000Z'), new Date('2026-09-30T23:59:59.999Z')],
  ] as const) {
    const rep = await buildTaxRegisterReport({ start, end });
    const hit = rep.rows.filter(r => /FT-MC-26|Cesaroni|Rumori/i.test(`${r.orderNumber||''} ${r.customerName||''} ${(r as any).description||''}`));
    console.log(label, 'taxRows', rep.rows.length, 'isabellaHits', hit.length, hit.map(r => ({ n: r.orderNumber, g: (r.grossCents||0)/100, date: r.date })));
  }

  // Corrispettivi T2/T3
  for (const q of [2,3] as const) {
    const sheet = await buildCorrispettiviSheet({ year: 2026, quarter: q });
    const rows = (sheet as any).rows || (sheet as any).lines || [];
    const arr = Array.isArray(rows) ? rows : [];
    const hit = arr.filter((r: any) => /FT-MC|Cesaroni|Rumori|25\.90|25,90/i.test(JSON.stringify(r)));
    console.log(`corrispettivi T${q} totalRows≈${arr.length} isabellaish=${hit.length}`);
    if (hit.length) console.log(hit.slice(0,5));
  }

  // Stripe 284.90 unmatched — is it in mancante pools?
  const tx = await prisma.stripeTransaction.findFirst({
    where: { id: 'stripe_eu_tx_txn_3TSzMsRrkwwcYwep11EAvI3P' },
    select: { id: true, amount: true, created: true, orderId: true, type: true, description: true },
  });
  console.log('stripe284', tx);

  // Count mancante that ARE this exact stripe id
  // How corrispettivi marks unmatched
  const { listUnmatchedGatewayForQuarter } = await import('@/lib/financial/dossierCorrispettiviBuild').catch(()=>({} as any));

  // General: PAID partner poses without TX
  const allPosePaid = await prisma.order.findMany({
    where: {
      deletedAt: null,
      isTest: false,
      partnerPaymentStatus: 'PAID',
      stripeTransactionId: null,
      OR: [{ isRecurring: true }, { additionalInstructions: { contains: 'Duplicato da', mode: 'insensitive' } }],
    },
    select: { orderNumber: true, totalPriceCents: true, buyerEmail: true, createdAt: true, isRecurring: true, additionalInstructions: true, paymentMethodLabel: true, grossAmount: true },
  });
  const filtered = allPosePaid.filter(o => isPrepaidSubscriptionPoseOrder(o));
  console.log('general active PAID poses noTX', filtered.length, filtered.map(o => `${o.orderNumber} ${(o.totalPriceCents/100).toFixed(2)} ${o.buyerEmail} ${o.createdAt.toISOString().slice(0,10)}`));

  // Schema: subscription / delivery count fields?
  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Order' ORDER BY 1`
  );
  const interesting = cols.map(c => c.column_name).filter(n => /subscr|carnet|parent|remain|bundle|deliver|recurr|pose|prepaid|quota/i.test(n));
  console.log('Order interesting cols', interesting);

  const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%subscr%' OR table_name ILIKE '%carnet%' OR table_name ILIKE '%deliver%plan%' OR table_name ILIKE '%bundle%')`
  );
  console.log('related tables', tables);

  await prisma.$disconnect();
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
