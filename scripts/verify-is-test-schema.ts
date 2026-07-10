/**
 * Verifica colonne is_test su Neon (nome Prisma @map, NON "isTest" camelCase).
 *
 * Uso:
 *   DATABASE_URL_UNPOOLED='postgresql://…neon…' npx tsx scripts/verify-is-test-schema.ts
 */
import { PrismaClient } from '@prisma/client';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';

loadEnvFiles();

const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    resolveProductionDatabaseUrl() ||
    process.env.DATABASE_URL?.trim();

if (!url) {
    console.error('Manca DATABASE_URL (preferire DATABASE_URL_UNPOOLED su Neon).');
    process.exit(1);
}

const databaseUrl = url;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const TABLES = [
    { table: 'Order', correct: 'is_test', wrong: 'isTest' },
    { table: 'User', correct: 'is_test', wrong: 'isTest' },
    { table: 'whatsapp_chat_sessions', correct: 'is_test', wrong: 'isTest' },
] as const;

async function columnExists(table: string, column: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        ) AS exists`,
        table,
        column
    );
    return Boolean(rows[0]?.exists);
}

async function main() {
    const host = databaseUrl.match(/@([^/:?]+)/)?.[1] ?? '?';
    console.log(`→ Verifica schema is_test su ${host}\n`);

    let ok = true;
    for (const { table, correct, wrong } of TABLES) {
        const hasCorrect = await columnExists(table, correct);
        const hasWrong = await columnExists(table, wrong);
        const status = hasCorrect ? 'OK' : 'MANCANTE';
        console.log(`${table}: ${correct} → ${status}${hasWrong ? ` | ATTENZIONE colonna errata "${wrong}" presente` : ''}`);
        if (!hasCorrect) ok = false;
    }

    const migration = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        `SELECT migration_name FROM "_prisma_migrations"
         WHERE migration_name = '20260710120000_is_test_sandbox' AND rolled_back_at IS NULL
         LIMIT 1`
    );
    console.log(
        `\n_prisma_migrations 20260710120000_is_test_sandbox: ${migration.length ? 'registrata' : 'NON registrata'}`
    );

    if (!ok) {
        console.log(`
Esegui su Neon SQL Editor (nomi corretti Prisma):

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_chat_sessions" ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS whatsapp_chat_sessions_is_test_idx ON "whatsapp_chat_sessions"(is_test);

-- Rimuovi colonne errate se create con nome "isTest":
ALTER TABLE "Order" DROP COLUMN IF EXISTS "isTest";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isTest";
ALTER TABLE "whatsapp_chat_sessions" DROP COLUMN IF EXISTS "isTest";
`);
        process.exit(1);
    }

    console.log('\nOK: schema is_test allineato a Prisma.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
