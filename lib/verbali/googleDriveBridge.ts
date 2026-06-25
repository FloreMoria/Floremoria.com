/**
 * Ponte locale Google Drive Desktop ↔ verbali repo (BARBARA / Obsidian / docs).
 * Assunzione: Google Drive Desktop sincronizza la cartella sul Mac; i .md in Ingresso-Barbara
 * entrano in pipeline senza copia manuale. I file canonici vengono specchiati in Obsidian-Mirror.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import {
    docsVerbaleFileName,
    obsidianGiornalieroFileName,
    isoFromObsidianGiornaliero,
} from './paths';

export const GOOGLE_DRIVE_VERBALI_SUBDIRS = {
    ingress: 'Ingresso-Barbara',
    mirror: 'Obsidian-Mirror',
    docs: 'Docs-Mirror',
} as const;

/** Percorso predefinito su Mac con Google Drive Desktop (percorso classico). */
export function defaultGoogleDriveVerbaliRoot(): string {
    return resolve(homedir(), 'Google Drive', 'Il mio Drive', 'FloreMoria - Verbali');
}

/** Risolve la root Drive da env o percorsi noti su macOS. */
export function resolveGoogleDriveVerbaliRoot(cwd: string = process.cwd()): string | null {
    const candidates = [
        process.env.GOOGLE_DRIVE_VERBALI_DIR?.trim(),
        defaultGoogleDriveVerbaliRoot(),
        resolve(homedir(), 'Library', 'CloudStorage', 'GoogleDrive-myaccount@gmail.com', 'Il mio Drive', 'FloreMoria - Verbali'),
    ].filter(Boolean) as string[];

    for (const dir of candidates) {
        if (existsSync(dir) && statSync(dir).isDirectory()) return dir;
    }

    // Se non esiste ancora, usa env o default per creazione guidata (setup script).
    return process.env.GOOGLE_DRIVE_VERBALI_DIR?.trim() || defaultGoogleDriveVerbaliRoot();
}

export function googleDriveIngressDir(root?: string | null): string {
    const base = root ?? resolveGoogleDriveVerbaliRoot() ?? defaultGoogleDriveVerbaliRoot();
    return resolve(base, GOOGLE_DRIVE_VERBALI_SUBDIRS.ingress);
}

export function googleDriveObsidianMirrorDir(root?: string | null): string {
    const base = root ?? resolveGoogleDriveVerbaliRoot() ?? defaultGoogleDriveVerbaliRoot();
    return resolve(base, GOOGLE_DRIVE_VERBALI_SUBDIRS.mirror);
}

export function googleDriveDocsMirrorDir(root?: string | null): string {
    const base = root ?? resolveGoogleDriveVerbaliRoot() ?? defaultGoogleDriveVerbaliRoot();
    return resolve(base, GOOGLE_DRIVE_VERBALI_SUBDIRS.docs);
}

/** Crea struttura cartelle Drive (idempotente). */
export function ensureGoogleDriveVerbaliLayout(root?: string | null): {
    root: string;
    ingress: string;
    mirror: string;
    docs: string;
} {
    const base = root ?? resolveGoogleDriveVerbaliRoot() ?? defaultGoogleDriveVerbaliRoot();
    const ingress = googleDriveIngressDir(base);
    const mirror = googleDriveObsidianMirrorDir(base);
    const docs = googleDriveDocsMirrorDir(base);

    for (const dir of [base, ingress, mirror, docs]) {
        mkdirSync(dir, { recursive: true });
    }

    const readme = resolve(base, 'README.txt');
    if (!existsSync(readme)) {
        writeFileSync(
            readme,
            `FloreMoria — Verbali (Google Drive Desktop)

Ingresso-Barbara/  → esporta qui i Google Doc ufficiali (.md) di BARBARA
Obsidian-Mirror/   ← mirror automatico da pipeline/repo
Docs-Mirror/       ← mirror docs/verbali/DD-MM-YYYY.md

Configura in .env.local:
  GOOGLE_DRIVE_VERBALI_DIR=${base}

Pipeline: npm run log:verbale:pipeline
`,
            'utf8'
        );
    }

    return { root: base, ingress, mirror, docs };
}

/** Copia tutti i verbali Obsidian del repo sul Drive locale (backfill). */
export function mirrorAllRepoVerbaliToGoogleDrive(cwd: string = process.cwd()): number {
    const obsidianDir = resolve(cwd, 'notes/obsidian/verbali');
    if (!existsSync(obsidianDir)) return 0;

    let count = 0;
    for (const fileName of readdirSync(obsidianDir)) {
        if (!fileName.endsWith('-Verbale-Giornaliero.md') && !fileName.endsWith('-Verbale-Consolidato.md')) {
            continue;
        }
        const iso =
            isoFromObsidianGiornaliero(fileName) ??
            fileName.replace(/-Verbale-(Giornaliero|Consolidato)\.md$/, '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;

        const absPath = resolve(obsidianDir, fileName);
        const obsidianContent = readFileSync(absPath, 'utf8');
        const body = obsidianContent
            .replace(/^---[\s\S]*?---\n/m, '')
            .replace(/^> Copia sincronizzata[^\n]*\n\n/m, '')
            .replace(/^> Pipeline automatica[^\n]*\n\n/m, '')
            .trim();

        mirrorVerbaleToGoogleDrive(iso, body, obsidianContent);
        count += 1;
    }
    return count;
}

/** Copia verbale canonico sul Drive locale (sync Desktop → cloud). */
export function mirrorVerbaleToGoogleDrive(
    iso: string,
    bodyMarkdown: string,
    obsidianContent?: string,
    root?: string | null
): { mirrorPath: string; docsPath: string } | null {
    const layout = ensureGoogleDriveVerbaliLayout(root);
    const mirrorPath = resolve(layout.mirror, obsidianGiornalieroFileName(iso));
    const docsPath = resolve(layout.docs, docsVerbaleFileName(iso));

    writeFileSync(mirrorPath, obsidianContent ?? bodyMarkdown.trim() + '\n', 'utf8');
    writeFileSync(docsPath, bodyMarkdown.trim() + '\n', 'utf8');

    return { mirrorPath, docsPath };
}

/** Elenco file .md in Ingresso-Barbara (Google Doc esportati o salvati da Antigravity). */
export function listGoogleDriveIngressMarkdown(root?: string | null): Array<{
    iso: string;
    fileName: string;
    absPath: string;
    mtimeMs: number;
    body: string;
}> {
    const ingress = googleDriveIngressDir(root);
    if (!existsSync(ingress)) return [];

    const out: Array<{
        iso: string;
        fileName: string;
        absPath: string;
        mtimeMs: number;
        body: string;
    }> = [];

    for (const fileName of readdirSync(ingress)) {
        if (!fileName.endsWith('.md')) continue;
        const isoFromObs = isoFromObsidianGiornaliero(fileName);
        const isoFromPlain = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(fileName)?.[1] ?? null;
        const iso = isoFromObs ?? isoFromPlain;
        if (!iso) continue;

        const absPath = resolve(ingress, fileName);
        out.push({
            iso,
            fileName,
            absPath,
            mtimeMs: statSync(absPath).mtimeMs,
            body: readFileSync(absPath, 'utf8'),
        });
    }

    return out.sort((a, b) => a.iso.localeCompare(b.iso));
}
