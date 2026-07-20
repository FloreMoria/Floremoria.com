/**
 * Importa e aggiorna skill Markdown da GitHub (Raw URL + Search Code API).
 * Modulo tool per lo staff / Social Media Manager AI — non altera i 22 Agent master.
 */
import {
    isSocialSkillId,
    type SocialSkillId,
    writeSkillMarkdown,
} from '@/src/agents/skillsLoader';

const RAW_HOSTS = new Set(['raw.githubusercontent.com']);
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const MAX_IMPORT_BYTES = 512_000;

export type GithubSkillImportResult = {
    skillId: SocialSkillId;
    sourceUrl: string;
    bytes: number;
    preview: string;
};

export type GithubSkillSearchHit = {
    name: string;
    path: string;
    repository: string;
    htmlUrl: string;
    score: number;
};

function assertSafeGithubRawUrl(rawUrl: string): URL {
    let url: URL;
    try {
        url = new URL(rawUrl.trim());
    } catch {
        throw new Error('URL GitHub non valido.');
    }

    if (url.protocol !== 'https:') {
        throw new Error('Sono consentiti solo URL https.');
    }

    // Accetta raw diretto oppure blob GitHub convertibile in raw
    if (RAW_HOSTS.has(url.hostname)) {
        return url;
    }

    if (GITHUB_HOSTS.has(url.hostname) && /\/blob\//.test(url.pathname)) {
        // https://github.com/owner/repo/blob/branch/path/file.md → raw
        const parts = url.pathname.split('/').filter(Boolean);
        // owner, repo, blob, branch, ...path
        if (parts.length < 5 || parts[2] !== 'blob') {
            throw new Error('URL blob GitHub non riconoscibile.');
        }
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[3];
        const filePath = parts.slice(4).join('/');
        return new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`);
    }

    throw new Error(
        'URL non consentito. Usa un Raw URL (raw.githubusercontent.com) o un link blob GitHub a un file .md.'
    );
}

/** Converte / valida un URL GitHub in Raw URL scaricabile. */
export function toGithubRawUrl(inputUrl: string): string {
    return assertSafeGithubRawUrl(inputUrl).toString();
}

async function fetchMarkdownFromRawUrl(rawUrl: string): Promise<string> {
    const url = assertSafeGithubRawUrl(rawUrl);
    const res = await fetch(url.toString(), {
        headers: {
            Accept: 'text/plain, text/markdown, */*',
            'User-Agent': 'FloreMoria-SkillImporter/1.0',
        },
        redirect: 'follow',
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Download fallito (${res.status}) da ${url.hostname}.`);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (
        contentType &&
        !contentType.includes('text') &&
        !contentType.includes('markdown') &&
        !contentType.includes('octet-stream')
    ) {
        throw new Error(`Content-Type non supportato: ${contentType}`);
    }

    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) {
        throw new Error(`File troppo grande (max ${MAX_IMPORT_BYTES} byte).`);
    }
    if (!text.trim()) {
        throw new Error('Il file scaricato è vuoto.');
    }
    return text;
}

/**
 * Scarica un .md da GitHub e lo scrive in agents/skills/{skillId}.md.
 */
export async function importSkillFromGithubUrl(params: {
    skillId: string;
    githubUrl: string;
}): Promise<GithubSkillImportResult> {
    if (!isSocialSkillId(params.skillId)) {
        throw new Error(
            `skillId non valido. Consentiti: instagram_skills, facebook_skills, tiktok_skills, youtube_shorts_skills, pinterest_skills.`
        );
    }

    const rawUrl = toGithubRawUrl(params.githubUrl);
    const markdown = await fetchMarkdownFromRawUrl(rawUrl);
    await writeSkillMarkdown(params.skillId, markdown);

    return {
        skillId: params.skillId,
        sourceUrl: rawUrl,
        bytes: Buffer.byteLength(markdown, 'utf8'),
        preview: markdown.slice(0, 280),
    };
}

/**
 * Cerca su GitHub Code Search skill/prompt social aggiornati.
 * Richiede GITHUB_TOKEN per rate limit utili (opzionale ma consigliato).
 */
export async function searchGithubSocialSkills(params: {
    query?: string;
    perPage?: number;
}): Promise<{ items: GithubSkillSearchHit[]; incompleteResults: boolean; message?: string }> {
    const q =
        params.query?.trim() ||
        'social media skills OR instagram prompt OR tiktok caption framework language:markdown';
    const perPage = Math.min(Math.max(params.perPage ?? 10, 1), 30);

    const url = new URL('https://api.github.com/search/code');
    url.searchParams.set('q', q);
    url.searchParams.set('per_page', String(perPage));

    const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'FloreMoria-SkillImporter/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
    };

    const token = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_API_TOKEN?.trim();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url.toString(), { headers, cache: 'no-store' });

    if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => '');
        return {
            items: [],
            incompleteResults: true,
            message:
                'GitHub Search Code richiede autenticazione o ha rate-limit stretto. Imposta GITHUB_TOKEN e riprova. ' +
                body.slice(0, 200),
        };
    }

    if (!res.ok) {
        throw new Error(`GitHub Search fallita (${res.status}).`);
    }

    const data = (await res.json()) as {
        incomplete_results?: boolean;
        items?: Array<{
            name: string;
            path: string;
            html_url: string;
            score?: number;
            repository?: { full_name?: string };
        }>;
    };

    const items: GithubSkillSearchHit[] = (data.items || []).map((item) => ({
        name: item.name,
        path: item.path,
        repository: item.repository?.full_name || '',
        htmlUrl: item.html_url,
        score: item.score ?? 0,
    }));

    return {
        items,
        incompleteResults: Boolean(data.incomplete_results),
        message: token
            ? undefined
            : 'Nessun GITHUB_TOKEN: risultati limitati. Consigliato impostare il token in env.',
    };
}
