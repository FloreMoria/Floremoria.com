/**
 * Risolve migration Prisma bloccata in stato "failed" (P3009) sul DB locale Docker.
 *
 * Uso (solo localhost / dev):
 *   npm run db:migrate:resolve-failed
 *
 * Produzione Neon: preferire GitHub Actions "Database migrate deploy".
 */
import { spawnSync } from 'node:child_process';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const FAILED = '20260616103000_user_role_admin_and_floremoria_logs';

const url = process.env.DATABASE_URL?.trim() || '';
const host = url.match(/@([^/:?]+)/)?.[1] ?? '';
if (host && !['localhost', '127.0.0.1'].includes(host)) {
    console.error(
        `Host "${host}" non è locale. Non usare questo script su Neon produzione.\n` +
            'Su produzione: GitHub Actions → "Database migrate deploy".'
    );
    process.exit(1);
}

console.log(`→ Risolvo migration fallita: ${FAILED}`);

const resolve = spawnSync(
    'npx',
    ['prisma', 'migrate', 'resolve', '--applied', FAILED],
    { stdio: 'inherit', env: process.env, shell: false }
);
if (resolve.status !== 0) process.exit(resolve.status ?? 1);

console.log('→ Applico migration pendenti…');
const deploy = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
});
process.exit(deploy.status ?? 1);
