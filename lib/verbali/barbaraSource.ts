/**
 * Legge i verbali redatti da BARBARA (Antigravity) dalla cartella Second Brain
 * o dal checkout CI di FloreMoria/Second_Brain_Sync.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { isEmptyScaffold } from './docsToObsidian';
import {
    googleDriveIngressDir,
    listGoogleDriveIngressMarkdown,
    resolveGoogleDriveVerbaliRoot,
} from './googleDriveBridge';

export type BarbaraVerbaleFile = {
    iso: string;
    fileName: string;
    absPath: string;
    kind: 'prot' | 'giornaliero' | 'consolidato';
    body: string;
    mtimeMs: number;
};

const BARBARA_FILE =
    /^(\d{4}-\d{2}-\d{2})(?:_PROT_\d+|(?:-Verbale-(?:Giornaliero|Consolidato)))\.md$/i;

/** Percorsi candidati: env → Google Drive → repo Second Brain in CI → vault locale Mac. */
export function resolveBarbaraDir(cwd: string = process.cwd()): string | null {
    const driveRoot = resolveGoogleDriveVerbaliRoot(cwd);
    const driveIngress = driveRoot ? googleDriveIngressDir(driveRoot) : null;

    const candidates = [
        process.env.BARBARA_VERBALI_DIR?.trim(),
        driveIngress,
        process.env.BARBARA_VERBALI_REPO_DIR?.trim(),
        resolve(cwd, '.barbara-sync'),
        '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/20_ARCHIVIO_LOG/Verbali_Barbara',
    ].filter(Boolean) as string[];

    for (const dir of candidates) {
        if (existsSync(dir) && statSync(dir).isDirectory()) {
            return dir;
        }
    }
    return null;
}

export function parseBarbaraFileName(fileName: string): {
    iso: string;
    kind: BarbaraVerbaleFile['kind'];
} | null {
    if (!fileName.endsWith('.md') && !fileName.endsWith('.txt')) return null;
    let iso: string | null = null;
    const ymd = /(\d{4}-\d{2}-\d{2})/.exec(fileName);
    if (ymd) {
        iso = ymd[1];
    } else {
        const dmy = /(\d{2})-(\d{2})-(\d{4})/.exec(fileName);
        if (dmy) iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    }
    if (!iso) return null;
    if (/PROT_/i.test(fileName)) return { iso, kind: 'prot' };
    if (/Consolidato/i.test(fileName)) return { iso, kind: 'consolidato' };
    return { iso, kind: 'giornaliero' };
}

/** Contenuto utile: esclude scaffold vuoti generati dal cron. */
export function hasBarbaraSubstance(body: string): boolean {
    if (isEmptyScaffold(body)) return false;
    const stripped = body
        .replace(/^---[\s\S]*?---\n/m, '')
        .replace(/\(Da compilare\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    return stripped.length > 120;
}

function extractSection(body: string, heading: string): string {
    const re = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`, 'i');
    const m = body.match(re);
    return m ? m[1].trim() : '';
}

/** Converte un verbale BARBARA (formato PROT o operativo) in markdown unificato per il repo. */
export function barbaraBodyToMarkdown(body: string, fileName: string): string {
    const title = body.match(/^#\s+(.*)$/m)?.[1]?.trim();
    const riassunto = body.match(/\*\*Riassunto:\*\*\s*(.*)/)?.[1]?.trim();
    const testoIntegrale = extractSection(body, 'Testo Integrale');
    const dettagli = extractSection(body, 'Dettagli Tecnici');

    if (testoIntegrale && hasBarbaraSubstance(testoIntegrale)) {
        const header = title ? `# ${title}\n\n` : '';
        const summary = riassunto ? `**Riassunto (BARBARA):** ${riassunto}\n\n` : '';
        const details =
            dettagli && !/^\s*-\s*\*\*Prompt Chiave/.test(dettagli)
                ? `\n\n## Dettagli operativi\n\n${dettagli}`
                : dettagli
                  ? `\n\n## Dettagli operativi\n\n${dettagli}`
                  : '';
        return `${header}${summary}${testoIntegrale}${details}`.trim();
    }

    const withoutFrontmatter = body.replace(/^---[\s\S]*?---\n?/m, '').trim();
    return withoutFrontmatter;
}

export function listBarbaraVerbali(cwd: string = process.cwd()): BarbaraVerbaleFile[] {
    const dir = resolveBarbaraDir(cwd);
    const fromDir = dir ? readBarbaraDir(dir) : [];

    // Unisce anche file .md da Google Drive Ingresso-Barbara (Google Doc esportati).
    const driveFiles = listGoogleDriveIngressMarkdown().flatMap((f) => {
        if (!hasBarbaraSubstance(f.body)) return [];
        return [
            {
                iso: f.iso,
                fileName: f.fileName,
                absPath: f.absPath,
                kind: 'giornaliero' as const,
                body: f.body,
                mtimeMs: f.mtimeMs,
            },
        ];
    });

    const byIso = new Map<string, BarbaraVerbaleFile>();
    for (const f of [...fromDir, ...driveFiles]) {
        const existing = byIso.get(f.iso);
        if (!existing || f.mtimeMs > existing.mtimeMs) byIso.set(f.iso, f);
    }
    return [...byIso.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

function readBarbaraDir(dir: string): BarbaraVerbaleFile[] {
    const out: BarbaraVerbaleFile[] = [];
    for (const fileName of readdirSync(dir)) {
        if (!fileName.endsWith('.md')) continue;
        const parsed = parseBarbaraFileName(fileName);
        if (!parsed) continue;
        const absPath = resolve(dir, fileName);
        const body = readFileSync(absPath, 'utf8');
        if (!hasBarbaraSubstance(body)) continue;
        out.push({
            iso: parsed.iso,
            fileName,
            absPath,
            kind: parsed.kind,
            body,
            mtimeMs: statSync(absPath).mtimeMs,
        });
    }
    return out.sort((a, b) => a.iso.localeCompare(b.iso));
}
export function pickBarbaraForDay(files: BarbaraVerbaleFile[], iso: string): BarbaraVerbaleFile | null {
    const day = files.filter((f) => f.iso === iso);
    if (day.length === 0) return null;
    const rank = (k: BarbaraVerbaleFile['kind']) =>
        k === 'consolidato' ? 3 : k === 'prot' ? 2 : 1;
    day.sort((a, b) => rank(b.kind) - rank(a.kind) || b.mtimeMs - a.mtimeMs);
    return day[0];
}
