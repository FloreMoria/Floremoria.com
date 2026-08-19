/**
 * Applica migration finance receipts + tax register evitando advisory lock Prisma.
 * Uso: npx tsx scripts/apply-finance-receipts-tax-register-migration.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const MIGRATION_NAME = '20260819190000_finance_receipts_tax_register';

const url =
    resolveProductionDatabaseUrl(process.cwd()) ||
    (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '').trim();

if (!url) {
    console.error('Manca DATABASE_URL Neon produzione');
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

const STATEMENTS = [
    `DO $$ BEGIN
  CREATE TYPE "FloristSettlementStatus" AS ENUM ('PENDING', 'BONIFICATO', 'RICEVUTA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "florist_compensation_cents" INTEGER`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "florist_vat_rate" DOUBLE PRECISION`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "florist_settlement_status" "FloristSettlementStatus" NOT NULL DEFAULT 'PENDING'`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "accessory_amount_cents" INTEGER`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "payment_method_label" VARCHAR(64)`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "finance_notes" TEXT`,
    `CREATE TABLE IF NOT EXISTS "customer_order_receipts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" VARCHAR(64),
    "issued_at" TIMESTAMP(3) NOT NULL,
    "period_key" VARCHAR(16) NOT NULL,
    "blob_path" TEXT NOT NULL,
    "blob_url" TEXT,
    "content_type" VARCHAR(128) NOT NULL DEFAULT 'text/html; charset=utf-8',
    "gross_cents" INTEGER NOT NULL,
    "floral_imponibile_cents" INTEGER NOT NULL,
    "accessory_imponibile_cents" INTEGER NOT NULL DEFAULT 0,
    "iva_debito_cents" INTEGER NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_order_receipts_pkey" PRIMARY KEY ("id")
)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "customer_order_receipts_order_id_key" ON "customer_order_receipts"("order_id")`,
    `CREATE INDEX IF NOT EXISTS "customer_order_receipts_issued_at_idx" ON "customer_order_receipts"("issued_at")`,
    `CREATE INDEX IF NOT EXISTS "customer_order_receipts_period_key_idx" ON "customer_order_receipts"("period_key")`,
    `CREATE INDEX IF NOT EXISTS "customer_order_receipts_order_number_idx" ON "customer_order_receipts"("order_number")`,
    `DO $$ BEGIN
  ALTER TABLE "customer_order_receipts"
    ADD CONSTRAINT "customer_order_receipts_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`,
];

async function main(): Promise<void> {
    for (const stmt of STATEMENTS) {
        await prisma.$executeRawUnsafe(stmt);
    }
    console.log('SQL_APPLIED', STATEMENTS.length);

    const sql = readFileSync(`prisma/migrations/${MIGRATION_NAME}/migration.sql`, 'utf8');
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
        MIGRATION_NAME
    );

    if (existing.length === 0) {
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

    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'Order'
           AND column_name IN (
             'florist_compensation_cents','florist_settlement_status','accessory_amount_cents','payment_method_label'
           )
         ORDER BY column_name`
    );
    console.log('ORDER_COLS', cols.map((c) => c.column_name).join(','));

    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'customer_order_receipts'`
    );
    console.log('TABLES', tables.map((t) => t.table_name).join(','));
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
