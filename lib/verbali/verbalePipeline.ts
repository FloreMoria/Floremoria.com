/**
 * Pipeline unica verbali — Regola Aurea (un giorno = un file in repo Obsidian).
 *
 * Fonti (in ordine di merge):
 * 1. BARBARA — Antigravity → Second Brain → GitHub Second_Brain_Sync (o vault locale)
 * 2. DEVIN/Cursor — docs/verbali/DD-MM-YYYY.md
 *
 * Destinazione: notes/obsidian/verbali/YYYY-MM-DD-Verbale-Giornaliero.md
 * (+ floremoria_logs via daily-verbale-sync.ts)
 */
import {
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    statSync,
    readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import {
    listBarbaraVerbali,
    pickBarbaraForDay,
    barbaraBodyToMarkdown,
    resolveBarbaraDir,
    hasBarbaraSubstance,
} from './barbaraSource';
import { docsVerbalePath } from './paths';
import {
    syncAllDocsVerbali,
    parseDocsVerbaleFilename,
    obsidianGiornalieroPath,
    obsidianConsolidatoPath,
    isEmptyScaffold,
    normalizeDocsBody,
    type VerbaleSyncResult,
} from './docsToObsidian';
import {
    purgeEmptyVerbaleScaffolds,
    mirrorCanonicalIfMissing,
} from './mirrorPaths';

export type PipelineResult = VerbaleSyncResult & {
    sources: string[];
};

function readDocsBody(cwd: string, iso: string): { rel: string; body: string } | null {
    const path = docsVerbalePath(cwd, iso);
    if (!existsSync(path)) return null;
    const body = normalizeDocsBody(readFileSync(path, 'utf8'));
    if (body.replace(/\s+/g, ' ').trim().length < 80) return null;
    return { rel: path.replace(cwd + '/', ''), body };
}

function mergeBodies(barbaraMd: string | null, docs: { rel: string; body: string } | null): string {
    if (barbaraMd && docs) {
        const barbaraTrim = barbaraMd.trim();
        const docsTrim = docs.body.trim();
        if (barbaraTrim.includes(docsTrim.slice(0, 80))) {
            return barbaraTrim;
        }
        if (docsTrim.includes(barbaraTrim.slice(0, 80))) {
            return docsTrim;
        }
        return `${barbaraTrim}\n\n---\n\n## Sviluppo tecnico (repo DEVIN)\n\n${docsTrim}`;
    }
    return (barbaraMd ?? docs?.body ?? '').trim();
}

function buildPipelineObsidian(
    iso: string,
    mergedBody: string,
    sources: string[]
): string {
    const syncedAt = new Date().toISOString();
    const sourceYaml = sources.map((s) => `"${s}"`).join(', ');
    return `---
date: ${iso}
tipo: verbale_giornaliero
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea, sync_pipeline]
sync_sources: [${sourceYaml}]
synced_at: ${syncedAt}
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica FloreMoria — un giorno, un verbale. Fonti: ${sources.join(' · ')}.

${mergedBody}`;
}

function shouldWritePipeline(
    obsidianPath: string,
    obsidianContent: string,
    newestSourceMtime: number
): boolean {
    if (obsidianContent.includes('lock_manual: true')) return false;
    if (isEmptyScaffold(obsidianContent)) return true;
    if (obsidianContent.includes('sync_pipeline') || obsidianContent.includes('sync_source')) {
        const obsMtime = statSync(obsidianPath).mtimeMs;
        return newestSourceMtime >= obsMtime;
    }
    return newestSourceMtime > statSync(obsidianPath).mtimeMs;
}

function collectIsoDates(cwd: string): string[] {
    const isos = new Set<string>();
    for (const f of listBarbaraVerbali(cwd)) {
        isos.add(f.iso);
    }
    const docsDir = resolve(cwd, 'docs/verbali');
    if (existsSync(docsDir)) {
        for (const name of readdirSync(docsDir)) {
            const iso = parseDocsVerbaleFilename(name);
            if (iso) isos.add(iso);
        }
    }
    return [...isos].sort();
}

/** Esegue merge BARBARA + docs → Obsidian repo per tutti i giorni con almeno una fonte. */
export function runVerbalePipeline(cwd: string = process.cwd()): PipelineResult[] {
    purgeEmptyVerbaleScaffolds(cwd);

    const barbaraDir = resolveBarbaraDir(cwd);
    const barbaraFiles = listBarbaraVerbali(cwd);
    if (barbaraDir) {
        console.log(`BARBARA: lettura da ${barbaraDir} (${barbaraFiles.length} file con contenuto)`);
    } else {
        console.warn(
            'BARBARA: cartella non trovata (imposta BARBARA_VERBALI_DIR o esegui CI con Second_Brain_Sync).'
        );
    }

    const results: PipelineResult[] = [];
    const obsidianDir = resolve(cwd, 'notes/obsidian/verbali');
    if (!existsSync(obsidianDir)) {
        mkdirSync(obsidianDir, { recursive: true });
    }

    for (const iso of collectIsoDates(cwd)) {
        const consolidatoPath = obsidianConsolidatoPath(cwd, iso);
        if (existsSync(consolidatoPath)) {
            results.push({
                iso,
                action: 'skipped',
                reason: 'Verbale-Consolidato presente',
                docsPath: docsVerbalePath(cwd, iso),
                obsidianPath: consolidatoPath,
                sources: [],
            });
            continue;
        }

        const barbaraPick = pickBarbaraForDay(barbaraFiles, iso);
        const docs = readDocsBody(cwd, iso);
        if (!barbaraPick && !docs) continue;

        const sources: string[] = [];
        let newestMtime = 0;

        let barbaraMd: string | null = null;
        if (barbaraPick) {
            barbaraMd = barbaraBodyToMarkdown(barbaraPick.body, barbaraPick.fileName);
            if (hasBarbaraSubstance(barbaraMd)) {
                sources.push(`barbara:${barbaraPick.fileName}`);
                newestMtime = Math.max(newestMtime, barbaraPick.mtimeMs);
            } else {
                barbaraMd = null;
            }
        }

        if (docs) {
            sources.push(docs.rel);
            const docsPath = docsVerbalePath(cwd, iso);
            if (existsSync(docsPath)) {
                newestMtime = Math.max(newestMtime, statSync(docsPath).mtimeMs);
            }
        }

        const merged = mergeBodies(barbaraMd, docs);
        if (!merged || merged.length < 80) continue;

        const obsidianPath = obsidianGiornalieroPath(cwd, iso);
        const next = buildPipelineObsidian(iso, merged, sources);

        if (!existsSync(obsidianPath)) {
            writeFileSync(obsidianPath, next, 'utf8');
            writeFileSync(docsVerbalePath(cwd, iso), merged.trim() + '\n', 'utf8');
            results.push({
                iso,
                action: 'created',
                docsPath: docsVerbalePath(cwd, iso),
                obsidianPath,
                sources,
            });
            continue;
        }

        const existing = readFileSync(obsidianPath, 'utf8');
        if (!shouldWritePipeline(obsidianPath, existing, newestMtime)) {
            results.push({
                iso,
                action: 'skipped',
                reason: 'Obsidian già aggiornato',
                docsPath: docsVerbalePath(cwd, iso),
                obsidianPath,
                sources,
            });
            continue;
        }

        writeFileSync(obsidianPath, next, 'utf8');
        writeFileSync(docsVerbalePath(cwd, iso), merged.trim() + '\n', 'utf8');
        results.push({
            iso,
            action: 'updated',
            docsPath: docsVerbalePath(cwd, iso),
            obsidianPath,
            sources,
        });
    }

    for (const iso of collectIsoDates(cwd)) {
        mirrorCanonicalIfMissing(cwd, iso);
    }

    // Solo docs/verbali senza data già gestita dalla pipeline (evita righe duplicate in log)
    const processedIsos = new Set(results.map((r) => r.iso));
    for (const r of syncAllDocsVerbali(cwd)) {
        if (processedIsos.has(r.iso)) continue;
        results.push({
            ...r,
            sources: [r.docsPath.replace(cwd + '/', '')].filter(Boolean),
        });
    }

    return results.sort((a, b) => a.iso.localeCompare(b.iso));
}

export function formatPipelineSummary(results: PipelineResult[]): string {
    const created = results.filter((r) => r.action === 'created').length;
    const updated = results.filter((r) => r.action === 'updated').length;
    const skipped = results.filter((r) => r.action === 'skipped').length;

    const lines = results.map((r) => {
        const rel = r.obsidianPath.replace(process.cwd() + '/', '');
        if (r.action === 'skipped') {
            return `[skip] ${r.iso}: ${r.reason ?? '—'} (${rel})`;
        }
        return `[${r.action}] ${r.iso} ← ${r.sources.join(' + ')} → ${rel}`;
    });

    const summary = `Totale: ${created} creati, ${updated} aggiornati, ${skipped} già allineati.`;
    if (created === 0 && updated === 0) {
        return `${summary}\n\n${lines.join('\n')}`;
    }
    return `${summary}\n\n${lines.join('\n')}`;
}
