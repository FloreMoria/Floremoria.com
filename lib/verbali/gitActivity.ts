import { execSync } from 'node:child_process';

export type GitCommitLine = {
    hash: string;
    subject: string;
    author: string;
    category: 'infrastruttura' | 'strategia' | 'sviluppo' | 'logistica';
};

const INFRA = /prisma|migrate|deploy|vercel|docker|neon|database|blob|workflow|ci\b|env|infra/i;
const STRATEGIA = /verbale|docs\/|agent|orchestr|regola|chore\(verbali\)|strateg/i;
const LOGISTICA = /ordini|order|fiorist|partner|delivery|consegna|futuria|whatsapp|stripe|pod|proof/i;

function categorize(subject: string): GitCommitLine['category'] {
    if (INFRA.test(subject)) return 'infrastruttura';
    if (LOGISTICA.test(subject)) return 'logistica';
    if (STRATEGIA.test(subject)) return 'strategia';
    return 'sviluppo';
}

/** Commit Git nel giorno di sessione (Europe/Rome, finestra 24h). */
export function getGitCommitsForSessionDay(cwd: string, iso: string): GitCommitLine[] {
    try {
        const since = `${iso}T00:00:00+0200`;
        const [y, m, d] = iso.split('-').map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        const untilIso = next.toISOString().slice(0, 10);
        const until = `${untilIso}T00:00:00+0200`;

        const raw = execSync(
            `git log --since="${since}" --until="${until}" --pretty=format:"%h|%s|%an" --no-merges`,
            { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 }
        ).trim();

        if (!raw) return [];

        return raw.split('\n').map((line) => {
            const [hash, subject, author] = line.split('|');
            return {
                hash: hash ?? '',
                subject: subject ?? line,
                author: author ?? '—',
                category: categorize(subject ?? line),
            };
        });
    } catch {
        return [];
    }
}

export function formatCommitsBullets(commits: GitCommitLine[]): string[] {
    return commits.map((c) => `- \`${c.hash}\` ${c.subject} _(${c.author})_`);
}
