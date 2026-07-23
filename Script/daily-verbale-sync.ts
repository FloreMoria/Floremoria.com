/**
 * Regola Aurea + automazione cloud (GitHub Actions):
 * - Calcola il giorno precedente nel fuso Europe/Rome.
 * - Unisce BARBARA + docs/verbali (pipeline) o genera da Git/operatività reale.
 * - Non crea mai schede vuote "(Da compilare)".
 * - Sincronizza floremoria_logs solo se esiste contenuto reale.
 */
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { runVerbalePipeline } from '../lib/verbali/verbalePipeline';
import { generateVerbaleFromOperations } from '../lib/verbali/generateFromOperations';
import {
    purgeEmptyVerbaleScaffolds,
    mirrorCanonicalIfMissing,
    writeCanonicalVerbaleFiles,
} from '../lib/verbali/mirrorPaths';
import {
    obsidianConsolidatoPath,
    obsidianGiornalieroPath,
    docsVerbalePath,
    isEmptyScaffold,
} from '../lib/verbali/paths';
import { syncVerbaleToFloremoriaLog } from '../lib/verbali/syncVerbaleToFloremoriaLog';

function loadEnvFiles(): void {
    for (const name of ['.env', '.env.local']) {
        const p = resolve(process.cwd(), name);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const i = t.indexOf('=');
            if (i === -1) continue;
            const key = t.slice(0, i).trim();
            let val = t.slice(i + 1).trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            if (process.env[key] === undefined) {
                process.env[key] = val;
            }
        }
    }
}

function getYesterdayRomeISO(): string {
    const tz = 'Europe/Rome';
    const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const [y, m, d] = todayStr.split('-').map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    anchor.setUTCDate(anchor.getUTCDate() - 1);
    const yy = anchor.getUTCFullYear();
    const mm = String(anchor.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(anchor.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function resolveSessionISO(): string {
    const raw = process.env.VERBALE_FORCE_ISO?.trim();
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (raw) console.warn(`VERBALE_FORCE_ISO ignorato (formato non valido): ${raw}`);
    return getYesterdayRomeISO();
}

function readVerbaleSource(cwd: string, iso: string): { path: string; body: string; summary: string } | null {
    const consolidato = obsidianConsolidatoPath(cwd, iso);
    if (existsSync(consolidato)) {
        const body = readFileSync(consolidato, 'utf8');
        if (isEmptyScaffold(body)) return null;
        return {
            path: consolidato.replace(cwd + '/', ''),
            body,
            summary: `Verbale consolidato archiviato (${iso}).`,
        };
    }

    const giornaliero = obsidianGiornalieroPath(cwd, iso);
    if (existsSync(giornaliero)) {
        const body = readFileSync(giornaliero, 'utf8');
        if (isEmptyScaffold(body)) {
            unlinkSync(giornaliero);
            return null;
        }
        return {
            path: giornaliero.replace(cwd + '/', ''),
            body,
            summary: `Verbale giornaliero (${iso}).`,
        };
    }

    const docs = docsVerbalePath(cwd, iso);
    if (existsSync(docs)) {
        const body = readFileSync(docs, 'utf8');
        if (isEmptyScaffold(body)) {
            unlinkSync(docs);
            return null;
        }
        mirrorCanonicalIfMissing(cwd, iso);
        return {
            path: giornaliero.replace(cwd + '/', ''),
            body: readFileSync(giornaliero, 'utf8'),
            summary: `Verbale giornaliero (${iso}).`,
        };
    }

    return null;
}

async function main(): Promise<void> {
    const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
    if (!isCI) loadEnvFiles();

    const cwd = process.cwd();
    const iso = resolveSessionISO();
    const forceIso = Boolean(process.env.VERBALE_FORCE_ISO?.trim());

    const purged = purgeEmptyVerbaleScaffolds(cwd);
    if (purged.length > 0) {
        console.log(`Rimossi ${purged.length} scaffold vuoti legacy.`);
    }

    for (const r of runVerbalePipeline(cwd)) {
        if (r.action !== 'skipped') {
            console.log(`Pipeline (${r.iso}): ${r.action} ← ${r.sources.join(' + ')}`);
        }
    }

    mirrorCanonicalIfMissing(cwd, iso);

    let source = readVerbaleSource(cwd, iso);

    if (!source) {
        const dbUrl = process.env.DATABASE_URL?.trim();
        let prisma: import('@prisma/client').PrismaClient | undefined;
        if (dbUrl) {
            const { PrismaClient } = await import('@prisma/client');
            prisma = new PrismaClient();
        }
        try {
            const generated = await generateVerbaleFromOperations(cwd, iso, prisma);
            if (generated) {
                writeCanonicalVerbaleFiles(cwd, iso, generated.markdown, {
                    syncSources: ['git:24h', dbUrl ? 'prisma:operativita' : 'git-only'],
                });
                source = {
                    path: obsidianGiornalieroPath(cwd, iso).replace(cwd + '/', ''),
                    body: readFileSync(obsidianGiornalieroPath(cwd, iso), 'utf8'),
                    summary: generated.shortSummary,
                };
                console.log(`Generato verbale ${iso} da Git/operatività.`);
            } else {
                console.log(`Nessun dato per ${iso}: verbale non creato (Regola Aurea).`);
            }
        } finally {
            await prisma?.$disconnect();
        }
    }

    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) {
        if (source) console.log(`Obsidian/fonte: ${source.path}`);
        else console.warn('DATABASE_URL assente: skip floremoria_logs.');
        return;
    }

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
        // Pulizia record scaffold vuoti legacy in dashboard
        await prisma.floremoriaLog.deleteMany({
            where: {
                AND: [
                    { fullText: { contains: '(Da compilare)' } },
                    { fullText: { contains: 'verbale_giornaliero_auto' } },
                ],
            },
        });

        if (!source) {
            console.log(`Skip DB per ${iso}: nessun contenuto reale.`);
            return;
        }

        const result = await syncVerbaleToFloremoriaLog(prisma, {
            iso,
            bodyMarkdown: source.body,
            sourceRelPath: source.path,
            keyPrompt: forceIso
                ? 'BARBARA (Segreteria Senior) — rettifica consolidato e allineamento dashboard'
                : 'BARBARA / DEVIN — Sync da operatività reale (Git + pipeline)',
        });
        console.log(`${result.action === 'updated' ? 'Aggiornato' : 'Inserito'} log id=${result.id} per ${iso}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
