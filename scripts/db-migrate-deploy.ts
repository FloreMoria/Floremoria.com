/**
 * migrate deploy con .env + .env.local e messaggio chiaro se il DB non è raggiungibile.
 */
import { spawnSync } from 'node:child_process';
import { loadEnvFiles, printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';

loadEnvFiles();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
    console.error('Manca DATABASE_URL in .env o .env.local');
    process.exit(1);
}

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
