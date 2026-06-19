/**
 * Scrive il verbale canonico su Neon produzione (floremoria_logs).
 * La dashboard Vercel legge Neon — non il Postgres locale di .env.local.
 *
 * Uso:
 *   VERBALE_FORCE_ISO=2026-06-19 npx tsx Script/sync-verbale-dashboard-production.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';
import { printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';
import { syncVerbaleToFloremoriaLog } from '../lib/verbali/syncVerbaleToFloremoriaLog';
import { docsVerbalePath, obsidianGiornalieroRel } from '../lib/verbali/paths';

async function main(): Promise<void> {
    const cwd = process.cwd();
    const iso = process.env.VERBALE_FORCE_ISO?.trim() || '2026-06-19';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        throw new Error(`VERBALE_FORCE_ISO non valido: ${iso}`);
    }

    // Evita che DATABASE_URL=localhost da .env.local nel processo padre vinca su Neon.
    for (const key of [
        'DATABASE_URL',
        'DATABASE_URL_UNPOOLED',
        'DATABASE_POSTGRES_URL',
        'DATABASE_POSTGRES_PRISMA_URL',
        'POSTGRES_URL',
        'POSTGRES_URL_NON_POOLING',
    ] as const) {
        delete process.env[key];
    }

    const docsPath = docsVerbalePath(cwd, iso);
    if (!existsSync(docsPath)) {
        throw new Error(`Verbale assente: ${docsPath}`);
    }

    const dbUrl = resolveProductionDatabaseUrl(cwd);
    if (!dbUrl) {
        throw new Error(
            'DATABASE_URL produzione non trovato. Esegui: npx vercel env pull .env.vercel.production.local --environment=production'
        );
    }

    if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
        throw new Error('Rifiuto sync produzione: DATABASE_URL punta a localhost.');
    }

    const body = readFileSync(docsPath, 'utf8');
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

    try {
        const result = await syncVerbaleToFloremoriaLog(prisma, {
            iso,
            bodyMarkdown: body,
            sourceRelPath: obsidianGiornalieroRel(iso),
        });
        console.log(
            `✓ Neon produzione: ${result.action} log id=${result.id} tag=${result.tag} (${iso})`
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('Sync verbale dashboard produzione fallito:', error);
    printDatabaseReachabilityHelp();
    process.exit(1);
});
