/**
 * Allinea schema Prisma sul Postgres Neon di produzione (Vercel).
 *
 * IMPORTANTE: `vercel env pull` spesso NON rivela i secret cifrati (valori vuoti).
 * Opzioni:
 *  1. GitHub Actions → workflow "Database migrate deploy" (secret DATABASE_URL)
 *  2. Inline: DATABASE_URL_UNPOOLED='postgresql://…@ep-….neon.tech/neondb?sslmode=require' npm run db:neon:migrate
 *  3. Salva URL reale in .env.production.local (Reveal da Vercel o Neon Console)
 */
import { spawnSync } from 'node:child_process';
import { printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';

function runPrismaSubcommand(subcommand: 'db push' | 'migrate deploy'): number {
    const url = resolveProductionDatabaseUrl(process.cwd());
    if (!url) {
        console.error(`
Manca connection string Neon produzione.

  DATABASE_URL_UNPOOLED='postgresql://…@ep-….neon.tech/neondb?sslmode=require' npm run db:neon:migrate

Oppure: GitHub → Actions → "Database migrate deploy" → Run workflow
`);
        return 1;
    }

    const host = url.match(/@([^/:?]+)/)?.[1] ?? '(host sconosciuto)';
    console.log(`→ ${subcommand} verso: ${host}`);

    const args = subcommand === 'db push' ? ['prisma', 'db', 'push'] : ['prisma', 'migrate', 'deploy'];
    const result = spawnSync('npx', args, {
        stdio: 'inherit',
        env: {
            ...process.env,
            DATABASE_URL: url,
            DATABASE_URL_UNPOOLED: url,
        },
        shell: false,
    });

    if (result.status !== 0) {
        printDatabaseReachabilityHelp();
        return result.status ?? 1;
    }

    console.log(`OK: ${subcommand} completato.`);
    return 0;
}

const mode = process.argv[2] === 'migrate' ? 'migrate deploy' : 'db push';
process.exit(runPrismaSubcommand(mode));
