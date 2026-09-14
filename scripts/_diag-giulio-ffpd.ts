import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
import prisma from '@/lib/prisma';
import { isPrepaidSubscriptionPoseOrder, orderHasRealGatewayPayment, orderLooksLikeDuplicatePose } from '@/lib/financial/prepaidSubscriptionOrders';

async function main() {
  const o = await prisma.order.findFirst({
    where: { orderNumber: 'FF-PD-26-004' },
    include: {
      items: { include: { product: { select: { name: true, slug: true } } } },
    },
  });
  if (!o) { console.log('NOT FOUND'); return; }
  const full = {
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    deletedAt: o.deletedAt,
    status: o.status,
    totalEuro: o.totalPriceCents / 100,
    partnerPaymentStatus: o.partnerPaymentStatus,
    isRecurring: o.isRecurring,
    stripeTransactionId: o.stripeTransactionId,
    grossAmount: o.grossAmount,
    netAmount: o.netAmount,
    stripeFee: o.stripeFee,
    paymentMethodLabel: o.paymentMethodLabel,
    buyerEmail: o.buyerEmail,
    buyerFullName: o.buyerFullName,
    deceasedName: o.deceasedName,
    additionalInstructions: o.additionalInstructions,
    financeNotes: o.financeNotes,
    items: o.items.map(i => `${i.quantity}x ${i.product?.name} @${(i.unitPriceCents||0)/100}`),
    hasGateway: orderHasRealGatewayPayment(o),
    looksDup: orderLooksLikeDuplicatePose(o),
    isPose: isPrepaidSubscriptionPoseOrder(o),
  };
  console.log(JSON.stringify(full, null, 2));

  // sibling orders same buyer
  const sibs = await prisma.order.findMany({
    where: {
      OR: [
        { buyerEmail: { equals: o.buyerEmail || '', mode: 'insensitive' } },
        { orderNumber: { startsWith: 'FF-PD-26' } },
      ],
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      orderNumber: true, createdAt: true, totalPriceCents: true, isRecurring: true,
      stripeTransactionId: true, partnerPaymentStatus: true, status: true,
      additionalInstructions: true, paymentMethodLabel: true, grossAmount: true,
    },
  });
  console.log('siblings', sibs.map(s => ({
    n: s.orderNumber,
    d: s.createdAt.toISOString().slice(0,10),
    euro: s.totalPriceCents/100,
    rec: s.isRecurring,
    tx: s.stripeTransactionId,
    pps: s.partnerPaymentStatus,
    st: s.status,
    pay: s.paymentMethodLabel,
    gross: s.grossAmount,
    notes: (s.additionalInstructions||'').slice(0,80),
    pose: isPrepaidSubscriptionPoseOrder(s),
  })));

  // any gateway tx ~39.99 same day/week
  const txs = await prisma.stripeTransaction.findMany({
    where: {
      amount: { gte: 39.98, lte: 40.01 },
      created: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') },
    },
    select: { id: true, amount: true, created: true, orderId: true, type: true, description: true },
    take: 20,
  });
  console.log('stripe ~39.99 July', txs);

  await prisma.$disconnect();
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
