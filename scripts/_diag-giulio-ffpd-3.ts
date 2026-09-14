import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
import prisma from '@/lib/prisma';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

async function main() {
  const siblings = await prisma.order.findMany({
    where: { orderNumber: { in: ['FF-PD-26-002','FF-PD-26-003','FF-PD-26-004'] } },
    select: {
      orderNumber: true, createdAt: true, totalPriceCents: true, isRecurring: true,
      stripeTransactionId: true, buyerEmail: true, buyerFullName: true, deceasedName: true,
      additionalInstructions: true, financeNotes: true, paymentMethodLabel: true,
      grossAmount: true, partnerPaymentStatus: true, status: true,
      items: { select: { priceCents: true, quantity: true, product: { select: { name: true } } } },
    },
  });
  for (const s of siblings) {
    console.log(JSON.stringify({
      n: s.orderNumber, d: s.createdAt.toISOString().slice(0,10), euro: s.totalPriceCents/100,
      email: s.buyerEmail, name: s.buyerFullName, dec: s.deceasedName,
      rec: s.isRecurring, tx: s.stripeTransactionId, pps: s.partnerPaymentStatus, st: s.status,
      notes: s.additionalInstructions,
      items: s.items.map(i => `${i.quantity}x ${i.product?.name}@${(i.priceCents||0)/100}`),
      pose: isPrepaidSubscriptionPoseOrder(s),
    }, null, 2));
  }

  // stripe_finance_movements schema
  const cols = await prisma.$queryRawUnsafe<any[]>(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='stripe_finance_movements' ORDER BY 1
  `);
  console.log('stripe cols', cols.map(c => c.column_name).join(', '));

  const moves = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, amount_cents, type, created_at, order_id, description, stripe_object_id
    FROM stripe_finance_movements
    WHERE amount_cents BETWEEN 3950 AND 4050
      AND created_at >= '2026-07-01' AND created_at < '2026-08-01'
    ORDER BY created_at
    LIMIT 40
  `).catch(async (e) => {
    console.log('q1 fail', String(e).slice(0,250));
    return prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM stripe_finance_movements WHERE amount_cents BETWEEN 3950 AND 4050 LIMIT 5
    `);
  });
  console.log('moves', JSON.stringify(moves, null, 2).slice(0, 3000));

  await prisma.$disconnect();
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
