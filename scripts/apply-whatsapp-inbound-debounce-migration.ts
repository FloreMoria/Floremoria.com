/**
 * Applica tabella debounce inbound WhatsApp (advisory-lock-safe).
 * Uso: npx tsx scripts/apply-whatsapp-inbound-debounce-migration.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const MIGRATION_NAME = '20260820093000_whatsapp_inbound_debounce';

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
    `CREATE TABLE IF NOT EXISTS "whatsapp_inbound_debounce_batches" (
    "id" TEXT NOT NULL,
    "phone_key" VARCHAR(128) NOT NULL,
    "outbound_address" VARCHAR(128) NOT NULL,
    "sender_name" VARCHAR(255) NOT NULL DEFAULT '',
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "last_inbound_at" TIMESTAMP(3) NOT NULL,
    "flush_after" TIMESTAMP(3) NOT NULL,
    "items_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_inbound_debounce_batches_pkey" PRIMARY KEY ("id")
)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_inbound_debounce_batches_phone_key_key"
  ON "whatsapp_inbound_debounce_batches"("phone_key")`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_inbound_debounce_batches_status_flush_after_idx"
  ON "whatsapp_inbound_debounce_batches"("status", "flush_after")`,
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
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
