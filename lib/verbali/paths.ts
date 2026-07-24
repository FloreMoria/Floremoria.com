import { resolve } from 'node:path';

/** Nome canonico Obsidian: YYYY-MM-DD-Verbale-giornaliero.md */
export function obsidianGiornalieroFileName(iso: string): string {
    return `${iso}-Verbale-giornaliero.md`;
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
    const dmy = /^(\d{2})-(\d{2})-(\d{4})-Verbale-giornaliero\.md$/i.exec(fileName);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const ymd = /^(\d{4}-\d{2}-\d{2})-Verbale-(?:Giornaliero|giornaliero)\.md$/i.exec(fileName);
    if (ymd) return ymd[1];
    return null;
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

export function extractSommario(bodyMarkdown: string, iso: string): string {
    const stripped = bodyMarkdown.replace(/^---[\s\S]*?---\n/m, '').trim();
    const match = stripped.match(/\*\*Riassunto(?:\s*\(.*?\))?:\*\*\s*(.*)/i);
    if (match && match[1].trim()) {
        return match[1].trim().split('\n')[0].replace(/"/g, '\\"');
    }
    const titleMatch = stripped.match(/^#\s+(.+)$/m);
    if (titleMatch && titleMatch[1].trim()) {
        return titleMatch[1].trim().replace(/"/g, '\\"');
    }
    const [y, m, d] = iso.split('-');
    return `Verbale operativo del ${d}-${m}-${y}`;
}

export function isEmptyScaffold(content: string): boolean {
    if (!content.includes('tipo: verbale_giornaliero_auto')) return false;
    const daCompilare = (content.match(/\(Da compilare\)/g) ?? []).length;
    return daCompilare >= 4;
}
