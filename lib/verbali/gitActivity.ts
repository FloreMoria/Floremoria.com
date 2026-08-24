import { execSync } from 'node:child_process';

export type VerbaleCategory = 'infrastruttura' | 'strategia' | 'sviluppo' | 'logistica';

export type GitCommitLine = {
    hash: string;
    subject: string;
    author: string;
    category: VerbaleCategory;
};

const INFRA = /prisma|migrate|deploy|vercel|docker|neon|database|blob|workflow|\bci\b|\benv\b|infra|launchagent|cron/i;
const STRATEGIA = /verbale|docs\/|agent|orchestr|regola|chore\(verbali\)|strateg|analisi/i;
const LOGISTICA = /ordini|order|fiorist|partner|delivery|consegna|futuria|whatsapp|stripe|pod|proof/i;

export function classifyVerbaleCategory(subject: string): VerbaleCategory {
    if (INFRA.test(subject)) return 'infrastruttura';
    if (LOGISTICA.test(subject)) return 'logistica';
    if (STRATEGIA.test(subject)) return 'strategia';
    return 'sviluppo';
}

/**
 * Commit Git tra 00:00 e 23:59 del giorno ISO, fuso Europe/Rome.
 * Formato richiesto: `%h - %s` (+ autore per il verbale).
 */
export function getGitCommitsForSessionDay(cwd: string, iso: string): GitCommitLine[] {
    try {
        const raw = execSync(
            `git log --since="${iso} 00:00:00" --until="${iso} 23:59:59" --pretty=format:"%h - %s | %an" --no-merges`,
            {
                cwd,
                encoding: 'utf8',
                maxBuffer: 512 * 1024,
                env: { ...process.env, TZ: 'Europe/Rome', LANG: 'it_IT.UTF-8' },
            }
        ).trim();

        if (!raw) return [];

        return raw.split('\n').map((line) => {
            const pipe = line.lastIndexOf(' | ');
            const left = pipe >= 0 ? line.slice(0, pipe) : line;
            const author = pipe >= 0 ? line.slice(pipe + 3).trim() : '—';
            const dash = left.indexOf(' - ');
            const hash = dash >= 0 ? left.slice(0, dash).trim() : '';
            const subject = dash >= 0 ? left.slice(dash + 3).trim() : left.trim();
            return {
                hash,
                subject,
                author,
                category: classifyVerbaleCategory(subject),
            };
        });
    } catch {
        return [];
    }
}

export function formatCommitsBullets(commits: GitCommitLine[]): string[] {
    return commits.map((c) => `- \`${c.hash}\` ${c.subject} _(${c.author})_`);
}
