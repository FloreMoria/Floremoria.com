/**
 * Sincronizza verbali da docs/verbali/DD-MM-YYYY.md verso notes/obsidian/verbali/.
 * Fonte canonica di redazione: docs/ (Cursor / team). Obsidian = copia vault + frontmatter.
 */
import {
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { applyVerbaleContentPolicy } from './contentPolicy';
import { mirrorVerbaleToGoogleDrive } from './googleDriveBridge';

export type VerbaleSyncResult = {
    iso: string;
    action: 'created' | 'updated' | 'skipped';
    reason?: string;
    docsPath: string;
    obsidianPath: string;
};

const DOCS_DIR = 'docs/verbali';
const OBSIDIAN_DIR = 'notes/obsidian/verbali';

/** DD-MM-YYYY.md → YYYY-MM-DD */
export function parseDocsVerbaleFilename(filename: string): string | null {
    const m = /^(\d{2})-(\d{2})-(\d{4})\.md$/.exec(filename);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
}

import {
    obsidianGiornalieroPath,
    obsidianConsolidatoPath,
    docsVerbalePath,
    extractSommario,
    isEmptyScaffold,
} from './paths';
import { mirrorToLocalObsidianVault } from './mirrorPaths';

/** Rimuove metadati di sync manuale obsoleti dal corpo docs. */
export function normalizeDocsBody(raw: string): string {
    return raw
        .replace(
            /^>\s*\*\*Sincronizzazione Obsidian:\*\*.*\n\n---\n\n/m,
            ''
        )
        .replace(/^>\s*\*\*Fonte:\*\*.*\n/m, '')
        .trimStart();
}

export function buildObsidianMarkdown(iso: string, docsRel: string, body: string): string {
    const normalized = applyVerbaleContentPolicy(normalizeDocsBody(body));
    const syncedAt = new Date().toISOString();
    const [y, m, d] = iso.split('-');
    const dateFormatted = `${d}-${m}-${y}`;
    const sommario = extractSommario(normalized, iso);

    return `---
date: ${dateFormatted}
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "${sommario.replace(/"/g, '\\"')}"
sync_source: ${docsRel}
synced_at: ${syncedAt}
---

> Copia sincronizzata automaticamente da \`${docsRel}\`. Modificare la fonte in \`docs/verbali/\`; rieseguire \`npm run log:verbale:sync-docs\`.

${normalized}`;
}


function shouldOverwriteObsidian(
    docsPath: string,
    obsidianPath: string,
    obsidianContent: string
): boolean {
    if (obsidianContent.includes('lock_manual: true')) return false;
    if (isEmptyScaffold(obsidianContent)) return true;
    if (obsidianContent.includes('sync_source:')) {
        const docsMtime = statSync(docsPath).mtimeMs;
        const obsMtime = statSync(obsidianPath).mtimeMs;
        return docsMtime >= obsMtime;
    }
    // Prima sync o copia manuale incompleta: docs/verbali/ vince (fonte canonica).
    return true;
}

/** Sincronizza un singolo giorno se esiste la fonte in docs/. */
export function syncDocsVerbaleToObsidian(cwd: string, iso: string): VerbaleSyncResult | null {
    const docsPath = docsVerbalePath(cwd, iso);
    if (!existsSync(docsPath)) {
        return null;
    }

    const consolidatoPath = obsidianConsolidatoPath(cwd, iso);
    if (existsSync(consolidatoPath)) {
        return {
            iso,
            action: 'skipped',
            reason: 'Esiste Verbale-Consolidato — non sovrascrivo.',
            docsPath,
            obsidianPath: consolidatoPath,
        };
    }

    const obsidianPath = obsidianGiornalieroPath(cwd, iso);
    const docsRel = docsPath.replace(cwd + '/', '');
    const docsBody = readFileSync(docsPath, 'utf8');
    const nextContent = buildObsidianMarkdown(iso, docsRel, docsBody);

    const obsidianDir = resolve(cwd, OBSIDIAN_DIR);
    if (!existsSync(obsidianDir)) {
        mkdirSync(obsidianDir, { recursive: true });
    }

    if (!existsSync(obsidianPath)) {
        writeFileSync(obsidianPath, nextContent, 'utf8');
        mirrorToLocalObsidianVault(iso, nextContent);
        try {
            mirrorVerbaleToGoogleDrive(iso, normalizeDocsBody(docsBody), nextContent);
        } catch {
            // Drive non montato: repo resta fonte per CI/Git.
        }
        return { iso, action: 'created', docsPath, obsidianPath };
    }

    const existing = readFileSync(obsidianPath, 'utf8');
    if (!shouldOverwriteObsidian(docsPath, obsidianPath, existing)) {
        return {
            iso,
            action: 'skipped',
            reason: 'Obsidian già aggiornato o redatto manualmente.',
            docsPath,
            obsidianPath,
        };
    }

    writeFileSync(obsidianPath, nextContent, 'utf8');
    mirrorToLocalObsidianVault(iso, nextContent);
    try {
        mirrorVerbaleToGoogleDrive(iso, normalizeDocsBody(docsBody), nextContent);
    } catch {
        // Drive non montato
    }
    return { iso, action: 'updated', docsPath, obsidianPath };
}

/** Scansiona tutti i verbali in docs/verbali/ e allinea Obsidian. */
export function syncAllDocsVerbali(cwd: string = process.cwd()): VerbaleSyncResult[] {
    const docsDir = resolve(cwd, DOCS_DIR);
    if (!existsSync(docsDir)) {
        return [];
    }

    const results: VerbaleSyncResult[] = [];
    for (const name of readdirSync(docsDir)) {
        if (!name.endsWith('.md')) continue;
        const iso = parseDocsVerbaleFilename(name);
        if (!iso) continue;
        const r = syncDocsVerbaleToObsidian(cwd, iso);
        if (r) results.push(r);
    }
    return results.sort((a, b) => a.iso.localeCompare(b.iso));
}
