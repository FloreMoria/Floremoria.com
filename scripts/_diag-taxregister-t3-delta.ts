import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
import { buildTaxRegisterReport } from '@/lib/financial/taxRegister';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import prisma from '@/lib/prisma';

async function main() {
  const before = await buildTaxRegisterReport({ year: 2026, mode: 'quarter', quarter: 3 });
  const poseHits = before.rows.filter(r => /FT-MC-26|FF-PD-26-004/i.test(r.orderNumber||''));
  console.log(JSON.stringify({
    rows: before.rows.length,
    summary: {
      gross: before.summary.grossCents/100,
      floralImp: before.summary.floralImponibileCents/100,
      accImp: before.summary.accessoryImponibileCents/100,
      iva: before.summary.ivaDebitoCents/100,
    },
    poseHits: poseHits.map(r => ({ n: r.orderNumber, g: r.grossCents/100 })),
    poseGrossSum: poseHits.reduce((s,r)=>s+r.grossCents,0)/100,
  }, null, 2));

  // Simulate after filter: which T3 orders would be excluded
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null, isTest: false,
      createdAt: { gte: new Date('2026-07-01'), lte: new Date('2026-09-30T23:59:59.999Z') },
      status: { notIn: ['CANCELLED','PENDING'] },
    },
    select: {
      orderNumber: true, totalPriceCents: true, isRecurring: true, stripeTransactionId: true,
      grossAmount: true, netAmount: true, stripeFee: true, paymentMethodLabel: true,
      additionalInstructions: true, financeNotes: true, status: true,
    },
  });
  const poses = orders.filter(o => isPrepaidSubscriptionPoseOrder(o));
  console.log('T3 pose-excluded candidates', poses.length, poses.map(p => `${p.orderNumber} €${(p.totalPriceCents/100).toFixed(2)} st=${p.status}`));
  await prisma.$disconnect();
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
