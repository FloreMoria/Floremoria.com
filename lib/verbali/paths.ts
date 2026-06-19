import { resolve } from 'node:path';

/** Nome canonico Obsidian: YYYY-MM-DD-Verbale-Giornaliero.md */
export function obsidianGiornalieroFileName(iso: string): string {
    return `${iso}-Verbale-Giornaliero.md`;
}

export function obsidianConsolidatoFileName(iso: string): string {
    return `${iso}-Verbale-Consolidato.md`;
}

/** Nome canonico docs: DD-MM-YYYY.md */
export function docsVerbaleFileName(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}.md`;
}

export function isoFromDocsFileName(fileName: string): string | null {
    const m = /^(\d{2})-(\d{2})-(\d{4})\.md$/.exec(fileName);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

export function isoFromObsidianGiornaliero(fileName: string): string | null {
    const m = /^(\d{4}-\d{2}-\d{2})-Verbale-Giornaliero\.md$/.exec(fileName);
    return m ? m[1] : null;
}

export function docsVerbalePath(cwd: string, iso: string): string {
    return resolve(cwd, 'docs/verbali', docsVerbaleFileName(iso));
}

export function obsidianGiornalieroPath(cwd: string, iso: string): string {
    return resolve(cwd, 'notes/obsidian/verbali', obsidianGiornalieroFileName(iso));
}

export function obsidianConsolidatoPath(cwd: string, iso: string): string {
    return resolve(cwd, 'notes/obsidian/verbali', obsidianConsolidatoFileName(iso));
}

export function docsVerbaleRel(iso: string): string {
    return `docs/verbali/${docsVerbaleFileName(iso)}`;
}

export function obsidianGiornalieroRel(iso: string): string {
    return `notes/obsidian/verbali/${obsidianGiornalieroFileName(iso)}`;
}
