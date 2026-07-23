import { writeFileSync, existsSync, mkdirSync, unlinkSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
    docsVerbalePath,
    obsidianGiornalieroPath,
    obsidianConsolidatoPath,
    docsVerbaleRel,
    obsidianGiornalieroRel,
    obsidianGiornalieroFileName,
    extractSommario,
    isEmptyScaffold,
} from './paths';
import { mirrorVerbaleToGoogleDrive } from './googleDriveBridge';

/** Copia i file generati nel vault locale Obsidian se presente sul sistema. */
export function mirrorToLocalObsidianVault(iso: string, content: string): void {
    const vaultDirs = [
        '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/10_VERBALI',
        '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/20_ARCHIVIO_LOG/Verbali_Barbara'
    ];

    for (const dir of vaultDirs) {
        try {
            if (existsSync(dir)) {
                const fileName = obsidianGiornalieroFileName(iso);
                const destPath = resolve(dir, fileName);
                writeFileSync(destPath, content, 'utf8');
                console.log(`[Obsidian Vault Sync] Allineato ${fileName} in ${dir}`);
            }
        } catch (e) {
            console.error(`[Obsidian Vault Sync] Errore di scrittura in ${dir}:`, e);
        }
    }
}

/** Scrive lo stesso contenuto in docs/verbali/ e notes/obsidian/verbali/ (naming canonico). */
export function writeCanonicalVerbaleFiles(
    cwd: string,
    iso: string,
    bodyMarkdown: string,
    meta?: { syncSources?: string[] }
): { docsPath: string; obsidianPath: string } {
    const syncedAt = new Date().toISOString();
    const sources = meta?.syncSources ?? ['generateFromOperations'];
    const sourceYaml = sources.map((s) => `"${s}"`).join(', ');
    const [y, m, d] = iso.split('-');
    const dateFormatted = `${d}-${m}-${y}`;
    const sommario = extractSommario(bodyMarkdown, iso);

    const obsidianContent = `---
date: ${dateFormatted}
tipo: verbale_giornaliero
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea, sync_pipeline]
sommario: "${sommario.replace(/"/g, '\\"')}"
sync_sources: [${sourceYaml}]
synced_at: ${syncedAt}
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica — fonti: ${sources.join(' · ')}.

${bodyMarkdown.trim()}
`;

    const docsDir = resolve(cwd, 'docs/verbali');
    const obsidianDir = resolve(cwd, 'notes/obsidian/verbali');
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(obsidianDir, { recursive: true });

    const docsPath = docsVerbalePath(cwd, iso);
    const obsidianPath = obsidianGiornalieroPath(cwd, iso);

    writeFileSync(docsPath, bodyMarkdown.trim() + '\n', 'utf8');
    writeFileSync(obsidianPath, obsidianContent, 'utf8');

    // Sincronizza nel vault locale di Obsidian del proprietario
    mirrorToLocalObsidianVault(iso, obsidianContent);

    try {
        mirrorVerbaleToGoogleDrive(iso, bodyMarkdown, obsidianContent);
    } catch {
        // Drive non montato sul Mac CI/Mac spento: non bloccare la pipeline repo.
    }

    return { docsPath, obsidianPath };
}

/** Rimuove schede vuote legacy con "(Da compilare)" — non generare più. */
export function purgeEmptyVerbaleScaffolds(cwd: string): string[] {
    const removed: string[] = [];
    const obsidianDir = resolve(cwd, 'notes/obsidian/verbali');
    if (!existsSync(obsidianDir)) return removed;

    for (const name of readdirSync(obsidianDir)) {
        if (!name.endsWith('-Verbale-Giornaliero.md')) continue;
        const path = resolve(obsidianDir, name);
        const content = readFileSync(path, 'utf8');
        if (!isEmptyScaffold(content)) continue;
        const iso = name.replace(/-Verbale-Giornaliero\.md$/, '');
        unlinkSync(path);
        removed.push(obsidianGiornalieroRel(iso));
    }
    return removed;
}

/** Se esiste solo un lato, copia verso l'altro con naming canonico. */
export function mirrorCanonicalIfMissing(cwd: string, iso: string): boolean {
    if (existsSync(obsidianConsolidatoPath(cwd, iso))) return false;

    const docsPath = docsVerbalePath(cwd, iso);
    const obsidianPath = obsidianGiornalieroPath(cwd, iso);

    if (existsSync(docsPath) && !existsSync(obsidianPath)) {
        const body = readFileSync(docsPath, 'utf8');
        if (isEmptyScaffold(body)) return false;
        writeCanonicalVerbaleFiles(cwd, iso, body, { syncSources: [docsVerbaleRel(iso)] });
        return true;
    }

    if (existsSync(obsidianPath) && !existsSync(docsPath)) {
        const raw = readFileSync(obsidianPath, 'utf8');
        if (isEmptyScaffold(raw)) return false;
        const body = raw.replace(/^---[\s\S]*?---\n/m, '').replace(/^> Pipeline automatica[^\n]*\n\n/m, '').trim();
        mkdirSync(dirname(docsPath), { recursive: true });
        writeFileSync(docsPath, body + '\n', 'utf8');
        mirrorToLocalObsidianVault(iso, raw);
        return true;
    }

    return false;
}
