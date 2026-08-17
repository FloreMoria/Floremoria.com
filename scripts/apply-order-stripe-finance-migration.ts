/**
 * Applica colonne Stripe finance su Order (prod) e marca la migration come applied.
 * Uso: npx tsx scripts/apply-order-stripe-finance-migration.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const MIGRATION_NAME = '20260817223000_order_stripe_finance_fields';

const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '').trim();
if (!url) {
    console.error('Manca DATABASE_URL / DATABASE_URL_UNPOOLED');
    process.exit(1);
}

const host = url.match(/@([^/:]+)/)?.[1] ?? '?';
if (host === 'localhost' || host === '127.0.0.1') {
    console.error('Rifiuto localhost — usare URL Neon produzione.');
    process.exit(1);
}

console.log(`→ host: ${host}`);
process.env.DATABASE_URL = url;
process.env.DATABASE_URL_UNPOOLED = url;

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main(): Promise<void> {
    await prisma.$executeRawUnsafe(
        'ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "gross_amount" DOUBLE PRECISION'
    );
    await prisma.$executeRawUnsafe(
        'ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripe_fee" DOUBLE PRECISION'
    );
    await prisma.$executeRawUnsafe(
        'ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "net_amount" DOUBLE PRECISION'
    );
    await prisma.$executeRawUnsafe(
        'ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripe_transaction_id" VARCHAR(255)'
    );
    console.log('COLUMNS_APPLIED');

    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'Order'
           AND column_name IN ('gross_amount','stripe_fee','net_amount','stripe_transaction_id')
         ORDER BY column_name`
    );
    console.log('COLS', cols.map((c) => c.column_name).join(','));

    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "_prisma_migrations"
         WHERE migration_name = $1
         LIMIT 1`,
        MIGRATION_NAME
    );

    if (existing.length === 0) {
        // Evita prisma migrate resolve: su Neon l'advisory lock può restare bloccato.
        const sql = readFileSync(`prisma/migrations/${MIGRATION_NAME}/migration.sql`, 'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const id = randomUUID();
        await prisma.$executeRawUnsafe(
            `INSERT INTO "_prisma_migrations"
              (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
             VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
            id,
            checksum,
            MIGRATION_NAME
        );
        console.log('MIGRATION_RECORDED', id);
    } else {
        console.log('MIGRATION_ALREADY_RECORDED');
    }

    await prisma.order.findMany({ take: 1, select: { id: true, grossAmount: true } });
    console.log('PROBE_OK');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
