/**
 * Applica tabelle contabilità Stripe (movimenti + fatture) evitando advisory lock Prisma migrate.
 * Uso: npx tsx scripts/apply-stripe-finance-tax-migration.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const MIGRATION_NAME = '20260818180000_stripe_finance_tax_quarterly';

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
    `CREATE TABLE IF NOT EXISTS "stripe_finance_movements" (
    "id" TEXT NOT NULL,
    "stripe_id" VARCHAR(128) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "reporting_category" VARCHAR(64),
    "description" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL DEFAULT 0,
    "net_cents" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'eur',
    "status" VARCHAR(32),
    "created_at_stripe" TIMESTAMP(3) NOT NULL,
    "available_on" TIMESTAMP(3),
    "source_id" VARCHAR(128),
    "payout_id" VARCHAR(128),
    "order_id" TEXT,
    "metadata_json" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stripe_finance_movements_pkey" PRIMARY KEY ("id")
)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "stripe_finance_movements_stripe_id_key" ON "stripe_finance_movements"("stripe_id")`,
    `CREATE INDEX IF NOT EXISTS "stripe_finance_movements_type_created_at_stripe_idx" ON "stripe_finance_movements"("type", "created_at_stripe")`,
    `CREATE INDEX IF NOT EXISTS "stripe_finance_movements_created_at_stripe_idx" ON "stripe_finance_movements"("created_at_stripe")`,
    `CREATE INDEX IF NOT EXISTS "stripe_finance_movements_payout_id_idx" ON "stripe_finance_movements"("payout_id")`,
    `CREATE TABLE IF NOT EXISTS "stripe_service_invoices" (
    "id" TEXT NOT NULL,
    "stripe_invoice_id" VARCHAR(128),
    "period_key" VARCHAR(16) NOT NULL,
    "number" VARCHAR(64),
    "status" VARCHAR(32),
    "issued_at" TIMESTAMP(3) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'eur',
    "total_fee_cents" INTEGER NOT NULL,
    "taxable_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "vat_reverse_charge_cents" INTEGER NOT NULL DEFAULT 0,
    "vendor_name" VARCHAR(128) NOT NULL DEFAULT 'Stripe Payments Europe Ltd',
    "invoice_pdf_url" TEXT,
    "hosted_invoice_url" TEXT,
    "local_pdf_path" TEXT,
    "metadata_json" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stripe_service_invoices_pkey" PRIMARY KEY ("id")
)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "stripe_service_invoices_stripe_invoice_id_key" ON "stripe_service_invoices"("stripe_invoice_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "stripe_service_invoices_period_key_key" ON "stripe_service_invoices"("period_key")`,
    `CREATE INDEX IF NOT EXISTS "stripe_service_invoices_issued_at_idx" ON "stripe_service_invoices"("issued_at")`,
    `CREATE INDEX IF NOT EXISTS "stripe_service_invoices_period_start_period_end_idx" ON "stripe_service_invoices"("period_start", "period_end")`,
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

    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('stripe_finance_movements','stripe_service_invoices')
         ORDER BY table_name`
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
