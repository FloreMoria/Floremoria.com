/**
 * Inietta un verbale BARBARA in docs + Obsidian + dashboard (Regola Aurea).
 *
 * Uso:
 *   VERBALE_FORCE_ISO=2026-06-19 npx tsx Script/inject-barbara-verbale.ts
 *   VERBALE_FORCE_ISO=2026-06-19 npx tsx Script/inject-barbara-verbale.ts docs/verbali/19-06-2026.md
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { writeCanonicalVerbaleFiles } from '../lib/verbali/mirrorPaths';
import { docsVerbalePath } from '../lib/verbali/paths';

loadEnvFiles();

function main(): void {
    const cwd = process.cwd();
    const iso =
        process.env.VERBALE_FORCE_ISO?.trim() ||
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Rome',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date());

    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        throw new Error(`VERBALE_FORCE_ISO non valido: ${iso}`);
    }

    const sourceArg = process.argv[2];
    const docsPath = sourceArg
        ? resolve(cwd, sourceArg)
        : docsVerbalePath(cwd, iso);

    if (!existsSync(docsPath)) {
        throw new Error(`Fonte verbale assente: ${docsPath}`);
    }

    const body = readFileSync(docsPath, 'utf8');
    const { docsPath: writtenDocs, obsidianPath } = writeCanonicalVerbaleFiles(cwd, iso, body, {
        syncSources: ['BARBARA:GoogleDocs', 'docs/verbali'],
    });

    console.log(`→ docs:     ${writtenDocs}`);
    console.log(`→ obsidian: ${obsidianPath}`);

    const barbaraDir =
        process.env.BARBARA_VERBALI_DIR?.trim() ||
        '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/20_ARCHIVIO_LOG/Verbali_Barbara';
    if (existsSync(barbaraDir)) {
        const barbaraPath = resolve(barbaraDir, `${iso}-Verbale-Giornaliero.md`);
        writeFileSync(barbaraPath, readFileSync(obsidianPath, 'utf8'), 'utf8');
        console.log(`→ barbara:  ${barbaraPath}`);
    }

    process.env.VERBALE_FORCE_ISO = iso;
    const sync = spawnSync('npx', ['tsx', 'Script/daily-verbale-sync.ts'], {
        cwd,
        env: process.env,
        stdio: 'inherit',
    });
    if (sync.status !== 0) {
        process.exit(sync.status ?? 1);
    }

    if (process.env.VERBALE_SKIP_PRODUCTION !== '1') {
        const prod = spawnSync('npx', ['tsx', 'Script/sync-verbale-dashboard-production.ts'], {
            cwd,
            env: { ...process.env, VERBALE_FORCE_ISO: iso },
            stdio: 'inherit',
        });
        if (prod.status !== 0) {
            console.warn(
                '⚠ Sync dashboard produzione (Neon) non riuscito — verifica .env.vercel.production.local'
            );
        }
    }
}

main();
