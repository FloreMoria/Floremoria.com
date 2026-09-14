import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
import prisma from '@/lib/prisma';

async function main() {
  // stripe model name?
  const models = Object.keys(prisma).filter(k => /stripe|paypal|payment/i.test(k) && !k.startsWith('$') && !k.startsWith('_'));
  console.log('models', models);

  const o = await prisma.order.findFirst({ where: { orderNumber: 'FF-PD-26-004' } });
  console.log('order id', o?.id, 'created', o?.createdAt);

  // Search StripeTransaction table via raw if needed
  const stripeRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, amount, type, "created", "orderId", description
    FROM "StripeTransaction"
    WHERE amount BETWEEN 39.5 AND 40.5
      AND "created" >= '2026-07-01' AND "created" < '2026-08-01'
    ORDER BY "created"
    LIMIT 30
  `).catch(async (e) => {
    console.log('StripeTransaction fail', String(e).slice(0,200));
    return prisma.$queryRawUnsafe<any[]>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name ILIKE '%stripe%'
    `);
  });
  console.log('stripeish', stripeRows);

  // PayPal
  const pp = await prisma.$queryRawUnsafe<any[]>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%paypal%' OR table_name ILIKE '%gateway%')
  `);
  console.log('pp tables', pp);

  // Look for Rosace / Tomasi payments
  const bank = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, "accountingDate", amount_cents, description
    FROM "FinancialLedgerEntry"
    WHERE description ILIKE '%rosace%' OR description ILIKE '%tomasi%' OR description ILIKE '%giulio%'
    LIMIT 20
  `).catch(e => [{ err: String(e).slice(0,300) }]);
  console.log('ledger hit', bank);

  // Parent package for Giulio?
  const allG = await prisma.order.findMany({
    where: { buyerEmail: { equals: 'giuliorosace@gmail.com', mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
    select: {
      orderNumber: true, createdAt: true, deletedAt: true, totalPriceCents: true,
      isRecurring: true, stripeTransactionId: true, status: true, partnerPaymentStatus: true,
      additionalInstructions: true, deceasedName: true,
    },
  });
  console.log('all giulio orders', allG.map(x => ({
    ...x, euro: x.totalPriceCents/100, d: x.createdAt.toISOString().slice(0,10), del: !!x.deletedAt
  })));

  await prisma.$disconnect();
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
