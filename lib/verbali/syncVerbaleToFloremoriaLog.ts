/**
 * Upsert verbale giornaliero in floremoria_logs (dashboard admin).
 */
import type { PrismaClient } from '@prisma/client';
import { applyVerbaleContentPolicy } from './contentPolicy';
import { docsVerbaleRel } from './paths';

function sessionDateAtNoon(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function italianLongDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const names = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
    ];
    return `${d} ${names[m - 1]} ${y}`;
}

function stripYamlFrontmatter(markdown: string): string {
    return markdown.replace(/^---[\s\S]*?---\n?/m, '').trim();
}

function extractShortSummary(bodyMarkdown: string, iso: string): string {
    const title = bodyMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (title) return title;
    return `Verbale operativo ${italianLongDate(iso)} (Regola Aurea)`;
}

export interface SyncVerbaleToLogInput {
    iso: string;
    bodyMarkdown: string;
    sourceRelPath: string;
    keyPrompt?: string;
}

export interface SyncVerbaleToLogResult {
    action: 'created' | 'updated';
    id: number;
    tag: string;
}

export async function syncVerbaleToFloremoriaLog(
    prisma: PrismaClient,
    input: SyncVerbaleToLogInput
): Promise<SyncVerbaleToLogResult> {
    const { iso, bodyMarkdown, sourceRelPath } = input;
    const tag = `#BARBARA_VERBALE_GIORNO_${iso}`;
    const legacyTag = `#BARBARA_VERBALE_CONSOLIDATO_${iso}`;
    const sessionDate = sessionDateAtNoon(iso);

    const existing = await prisma.floremoriaLog.findFirst({
        where: { sessionDate, OR: [{ tag }, { tag: legacyTag }] },
        orderBy: { id: 'desc' },
    });

    const normalizedBody = stripYamlFrontmatter(bodyMarkdown);
    const bodyForDb = applyVerbaleContentPolicy(normalizedBody);
    const shortSummary = extractShortSummary(normalizedBody, iso);

    const data = {
        sessionDate,
        tag,
        topic: `Verbale operativo ${italianLongDate(iso)} (Regola Aurea)`,
        shortSummary,
        keyPrompt:
            input.keyPrompt ??
            'BARBARA / VITO / PETRA — Consolidamento sessione e sync dashboard Neon',
        fullText: `${bodyForDb.slice(0, 48000)}\n\n---\nSorgente: ${sourceRelPath}`,
        discussedPoints: `Contenuto in ${sourceRelPath} e ${docsVerbaleRel(iso)}.`,
        achievedResults:
            'Verbale BARBARA sincronizzato su Obsidian e floremoria_logs (dashboard admin).',
        pendingTasks: null as string | null,
        criticalAlarms: null as string | null,
    };

    if (existing) {
        const updated = await prisma.floremoriaLog.update({
            where: { id: existing.id },
            data: { ...data, tag },
        });
        return { action: 'updated', id: updated.id, tag };
    }

    const created = await prisma.floremoriaLog.create({ data });
    return { action: 'created', id: created.id, tag };
}
