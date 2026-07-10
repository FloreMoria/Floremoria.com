import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function pickDatabaseUrl(): string | null {
    const candidates = [
        process.env.DATABASE_URL_UNPOOLED,
        process.env.DATABASE_POSTGRES_URL_NON_POOLING,
        process.env.DATABASE_POSTGRES_PRISMA_URL,
        process.env.DATABASE_POSTGRES_URL,
        process.env.DATABASE_URL,
    ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    const neon = candidates.find((value) => /neon\.tech|vercel-storage\.com/i.test(value));
    if (neon) return neon;

    const nonLocal = candidates.find((value) => !/localhost|127\.0\.0\.1/i.test(value));
    return nonLocal ?? candidates[0] ?? null;
}

function loadProductionEnv(): void {
    const explicitEnv = process.env.FLOREM_BACKFILL_ENV_FILE?.trim();
    const envFiles = [
        ...(explicitEnv ? [explicitEnv] : []),
        '/tmp/floremoria-prod-env.tmp',
        resolve(process.cwd(), '.env.vercel.production.local'),
        resolve(process.cwd(), '.env.vercel.production'),
        resolve(process.cwd(), '.env.prod.dbcheck'),
    ];
    for (const envPath of envFiles) {
        if (envPath && existsSync(envPath)) {
            config({ path: envPath, override: true });
        }
    }

    const databaseUrl = pickDatabaseUrl();
    if (!databaseUrl) {
        console.error('DATABASE_URL assente. Esegui prima: npx vercel env pull /tmp/floremoria-prod-env.tmp --environment production --yes');
        process.exit(1);
    }

    if (/localhost|127\.0\.0\.1/i.test(databaseUrl)) {
        console.error('DATABASE_URL punta a localhost. Usa env pull produzione in /tmp/floremoria-prod-env.tmp');
        process.exit(1);
    }

    process.env.DATABASE_URL = databaseUrl;
    const host = databaseUrl.match(/@([^/]+)/)?.[1] ?? 'unknown';
    console.info('[backfill] DB host:', host);
}

const ORDER_NUMBER = process.argv[2]?.trim();
if (!ORDER_NUMBER) {
    console.error('Uso: npx tsx scratch/backfill-order-chat.ts <orderNumber>');
    process.exit(1);
}

async function main() {
    loadProductionEnv();

    const { backfillOrderChatLog } = await import('../lib/vera/orderWorkflow/backfillOrderChatLog');
    const prisma = (await import('../lib/prisma')).default;

    const result = await backfillOrderChatLog(ORDER_NUMBER);
    console.log(JSON.stringify(result, null, 2));
    await prisma.$disconnect();
    if (!result.ok) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
