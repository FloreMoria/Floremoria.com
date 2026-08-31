/**
 * Bonifica movimenti Fineco duplicati (manuale vs PDF/CSV).
 * Uso: npx tsx scripts/clean-duplicate-bank-movements.ts
 * Opzioni: --from=2026-01-01  --dry-run
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const dbUrl =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';

if (!dbUrl) {
    console.error(
        'Manca DATABASE_URL: imposta DATABASE_URL_UNPOOLED o DATABASE_URL in .env.local / .env'
    );
    process.exit(1);
}

process.env.DATABASE_URL = dbUrl;
if (!process.env.DATABASE_URL_UNPOOLED?.trim()) {
    process.env.DATABASE_URL_UNPOOLED = dbUrl;
}

const host = dbUrl.match(/@([^/:?]+)/)?.[1] ?? '?';
console.log(`→ database host: ${host}`);

async function main() {
    const fromArg = process.argv.find((a) => a.startsWith('--from='));
    const dryRun = process.argv.includes('--dry-run');
    const fromDate = fromArg
        ? new Date(`${fromArg.slice('--from='.length)}T00:00:00.000Z`)
        : new Date('2026-01-01T00:00:00.000Z');

    const { cleanDuplicateBankLines } = await import(
        '../lib/financial/bankStatements/deduplicateBankLinesDb'
    );
    const prisma = (await import('../lib/prisma')).default;

    console.log(
        `Cleaning duplicate Fineco bank lines from ${fromDate.toISOString().slice(0, 10)}` +
            (dryRun ? ' (dry-run)' : '') +
            '…'
    );

    const result = await cleanDuplicateBankLines({ fromDate, dryRun });
    console.log('clean result:', JSON.stringify(result, null, 2));

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    process.exit(1);
});
