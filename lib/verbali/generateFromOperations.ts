import type { PrismaClient } from '@prisma/client';
import { applyVerbaleContentPolicy } from './contentPolicy';
import {
    getGitCommitsForSessionDay,
    formatCommitsBullets,
    type GitCommitLine,
} from './gitActivity';

export type VerbaleSections = {
    infrastruttura: string[];
    strategia: string[];
    sviluppo: string[];
    logistica: string[];
};

function italianLongDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const names = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
    ];
    return `${d} ${names[m - 1]} ${y}`;
}

function sessionBounds(iso: string): { start: Date; end: Date } {
    const [y, m, d] = iso.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
    return { start, end };
}

function bucketCommits(commits: GitCommitLine[]): Omit<VerbaleSections, never> {
    const sections: VerbaleSections = {
        infrastruttura: [],
        strategia: [],
        sviluppo: [],
        logistica: [],
    };
    for (const c of commits) {
        sections[c.category].push(`- \`${c.hash}\` ${c.subject} _(${c.author})_`);
    }
    return sections;
}

async function loadOperationalMetrics(
    prisma: PrismaClient,
    iso: string
): Promise<string[]> {
    const { start, end } = sessionBounds(iso);
    const lines: string[] = [];

    const [ordersCreated, ordersPaid, inProgress, delivered, proofs] = await Promise.all([
        prisma.order.count({ where: { createdAt: { gte: start, lt: end } } }),
        prisma.order.count({
            where: { partnerPaymentStatus: 'PAID', updatedAt: { gte: start, lt: end } },
        }),
        prisma.order.count({
            where: { status: { in: ['IN_PROGRESS', 'DELIVERING'] }, updatedAt: { gte: start, lt: end } },
        }),
        prisma.order.count({
            where: { status: 'COMPLETED', updatedAt: { gte: start, lt: end } },
        }),
        prisma.deliveryProof.count({
            where: { status: 'COMPLETED', updatedAt: { gte: start, lt: end } },
        }),
    ]);

    if (ordersCreated > 0) lines.push(`- Nuovi ordini registrati: **${ordersCreated}**`);
    if (ordersPaid > 0) lines.push(`- Pagamenti confermati: **${ordersPaid}**`);
    if (inProgress > 0) lines.push(`- Ordini in lavorazione/consegna: **${inProgress}**`);
    if (delivered > 0) lines.push(`- Consegne completate: **${delivered}**`);
    if (proofs > 0) lines.push(`- Prove visive (PoD) chiuse: **${proofs}**`);

    return lines;
}

function sectionBlock(title: string, items: string[]): string {
    if (items.length === 0) return `${title}\n\n- _Nessuna attività registrata per questa giornata._\n`;
    return `${title}\n\n${items.join('\n')}\n`;
}

function hasSubstance(sections: VerbaleSections, commits: GitCommitLine[]): boolean {
    if (commits.length > 0) return true;
    return (
        sections.infrastruttura.length +
            sections.strategia.length +
            sections.sviluppo.length +
            sections.logistica.length >
        0
    );
}

/**
 * Genera verbale da commit Git (ultime 24h del giorno) + metriche operativi (se DATABASE_URL).
 * Restituisce null se non c'è nulla da documentare — niente scaffold vuoto.
 */
export async function generateVerbaleFromOperations(
    cwd: string,
    iso: string,
    prisma?: PrismaClient
): Promise<{ markdown: string; shortSummary: string } | null> {
    const commits = getGitCommitsForSessionDay(cwd, iso);
    const sections = bucketCommits(commits);

    if (prisma) {
        try {
            const ops = await loadOperationalMetrics(prisma, iso);
            sections.logistica.push(...ops);
        } catch {
            // DB opzionale: i commit Git bastano per la sezione Sviluppo
        }
    }

    if (!hasSubstance(sections, commits)) {
        return null;
    }

    const label = italianLongDate(iso);
    const commitSummary =
        commits.length > 0
            ? `${commits.length} commit su main (${formatCommitsBullets(commits).slice(0, 2).join('; ')}${commits.length > 2 ? '…' : ''})`
            : 'Metriche operativi del giorno';

    const markdown = `# Verbale Operativo FloreMoria — ${label}

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** ${iso}.

${sectionBlock('## Sezione 1 — Infrastruttura', sections.infrastruttura)}
${sectionBlock('## Sezione 2 — Strategia', sections.strategia)}
${sectionBlock('## Sezione 3 — Sviluppo', sections.sviluppo)}
${sectionBlock('## Sezione 4 — Logistica', sections.logistica)}
`;

    return {
        markdown: applyVerbaleContentPolicy(markdown.trim()) + '\n',
        shortSummary: `Verbale operativo ${iso}: ${commitSummary}.`,
    };
}
