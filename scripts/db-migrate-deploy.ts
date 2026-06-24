/**
 * migrate deploy con .env + .env.local e messaggio chiaro se il DB non è raggiungibile.
 */
import { spawnSync } from 'node:child_process';
import { printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';

const url =
    resolveProductionDatabaseUrl() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.DATABASE_URL_UNPOOLED?.trim();

if (!url) {
    console.error(
        'Manca DATABASE_URL produzione.\n' +
            '  DATABASE_URL_UNPOOLED=\'postgresql://…@ep-….neon.tech/neondb?sslmode=require\' npm run db:migrate:deploy\n' +
            'Oppure: GitHub → Actions → "Database migrate deploy" → Run workflow'
    );
    process.exit(1);
}

process.env.DATABASE_URL = url;
process.env.DATABASE_URL_UNPOOLED = url;

const hostMatch = url.match(/@([^/:]+)/);
console.log(`→ migrate deploy verso host: ${hostMatch?.[1] ?? '(url)'}`);

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
});

if (result.status !== 0) {
    printDatabaseReachabilityHelp();
    process.exit(result.status ?? 1);
}

console.log('OK: migrazioni applicate.');
