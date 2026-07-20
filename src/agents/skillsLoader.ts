/**
 * Carica le skill Markdown da agents/skills/ e le inietta nei System Prompt.
 * Non modifica i master dei 22 Agent: è un layer opzionale e additivo.
 *
 * Assumption: le skill vivono in `agents/skills/` (equivalente operativo di
 * Agent_formato_md/agents/skills nel monorepo FloreMoria).
 */
import { promises as fs } from 'fs';
import path from 'path';

export const SOCIAL_SKILL_IDS = [
    'instagram_skills',
    'facebook_skills',
    'tiktok_skills',
    'youtube_shorts_skills',
    'pinterest_skills',
] as const;

export type SocialSkillId = (typeof SOCIAL_SKILL_IDS)[number];

export type SkillChannel =
    | 'instagram'
    | 'facebook'
    | 'tiktok'
    | 'youtube_shorts'
    | 'pinterest';

const CHANNEL_TO_SKILL: Record<SkillChannel, SocialSkillId> = {
    instagram: 'instagram_skills',
    facebook: 'facebook_skills',
    tiktok: 'tiktok_skills',
    youtube_shorts: 'youtube_shorts_skills',
    pinterest: 'pinterest_skills',
};

const SKILL_FILE_MAX_BYTES = 512_000;

/** Directory skill relativa alla root del progetto Next.js. */
export function getAgentsSkillsDir(): string {
    return path.join(process.cwd(), 'agents', 'skills');
}

export function isSocialSkillId(value: string): value is SocialSkillId {
    return (SOCIAL_SKILL_IDS as readonly string[]).includes(value);
}

export function skillIdFromChannel(channel: SkillChannel): SocialSkillId {
    return CHANNEL_TO_SKILL[channel];
}

export function skillFilePath(skillId: SocialSkillId): string {
    return path.join(getAgentsSkillsDir(), `${skillId}.md`);
}

/** Elenco skill note (whitelist) con eventuale presenza su disco. */
export async function listSocialSkills(): Promise<
    Array<{ id: SocialSkillId; filename: string; exists: boolean; bytes: number | null }>
> {
    const dir = getAgentsSkillsDir();
    const results: Array<{
        id: SocialSkillId;
        filename: string;
        exists: boolean;
        bytes: number | null;
    }> = [];

    for (const id of SOCIAL_SKILL_IDS) {
        const filename = `${id}.md`;
        const full = path.join(dir, filename);
        try {
            const stat = await fs.stat(full);
            results.push({ id, filename, exists: true, bytes: stat.size });
        } catch {
            results.push({ id, filename, exists: false, bytes: null });
        }
    }

    return results;
}

/**
 * Legge il markdown di una skill. Perché: gli Agent devono poter iniettare
 * regole canale-specifiche senza hardcodare copy nel codice.
 */
export async function loadSkillMarkdown(skillId: SocialSkillId): Promise<string> {
    const full = skillFilePath(skillId);
    const content = await fs.readFile(full, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > SKILL_FILE_MAX_BYTES) {
        throw new Error(`Skill ${skillId} supera il limite di ${SKILL_FILE_MAX_BYTES} byte.`);
    }
    return content;
}

export async function loadSkillMarkdownSafe(skillId: SocialSkillId): Promise<string | null> {
    try {
        return await loadSkillMarkdown(skillId);
    } catch {
        return null;
    }
}

/** Scrive/aggiorna una skill (uso staff / import GitHub). Path confinato alla whitelist. */
export async function writeSkillMarkdown(skillId: SocialSkillId, markdown: string): Promise<void> {
    const trimmed = markdown.replace(/\r\n/g, '\n').trim();
    if (!trimmed) {
        throw new Error('Il contenuto della skill non può essere vuoto.');
    }
    if (Buffer.byteLength(trimmed, 'utf8') > SKILL_FILE_MAX_BYTES) {
        throw new Error(`Contenuto troppo grande (max ${SKILL_FILE_MAX_BYTES} byte).`);
    }

    const dir = getAgentsSkillsDir();
    await fs.mkdir(dir, { recursive: true });
    const full = skillFilePath(skillId);
    // Path traversal guard: il file deve restare dentro agents/skills
    const resolved = path.resolve(full);
    if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
        throw new Error('Percorso skill non consentito.');
    }
    await fs.writeFile(resolved, `${trimmed}\n`, 'utf8');
}

/**
 * Blocco formattato da appendere a un System Prompt.
 * Perché: delimitatori chiari evitano che il modello confonda skill e identità Agent.
 */
export function formatSkillBlock(skillId: SocialSkillId, markdown: string): string {
    return [
        `### SKILL INIETTATA: ${skillId}`,
        'Le regole seguenti prevalgono sulle abitudini generiche di social media, ma NON sulle policy etiche SOFIA/ALMA né sul protocollo master dell’Agent.',
        '',
        markdown.trim(),
        '',
        `### FINE SKILL: ${skillId}`,
    ].join('\n');
}

/**
 * Inietta una o più skill nel System Prompt base.
 * I master Agent restano intatti: si passa solo il prompt runtime.
 */
export async function injectSkillsIntoSystemPrompt(
    baseSystemPrompt: string,
    skillIds: SocialSkillId[]
): Promise<string> {
    const unique = [...new Set(skillIds)].filter(isSocialSkillId);
    if (unique.length === 0) {
        return baseSystemPrompt;
    }

    const blocks: string[] = [];
    for (const id of unique) {
        const md = await loadSkillMarkdownSafe(id);
        if (md) {
            blocks.push(formatSkillBlock(id, md));
        }
    }

    if (blocks.length === 0) {
        return baseSystemPrompt;
    }

    return `${baseSystemPrompt.trim()}\n\n## Social Media Skills (runtime)\n\n${blocks.join('\n\n')}`;
}

/** Convenience: inietta la skill di un singolo canale. */
export async function injectChannelSkillIntoSystemPrompt(
    baseSystemPrompt: string,
    channel: SkillChannel
): Promise<string> {
    return injectSkillsIntoSystemPrompt(baseSystemPrompt, [skillIdFromChannel(channel)]);
}

/** Carica tutte le skill social disponibili e le concatena (prompt multi-canale). */
export async function loadAllSocialSkillsPromptSection(): Promise<string> {
    const blocks: string[] = [];
    for (const id of SOCIAL_SKILL_IDS) {
        const md = await loadSkillMarkdownSafe(id);
        if (md) blocks.push(formatSkillBlock(id, md));
    }
    if (blocks.length === 0) return '';
    return `## Social Media Skills (runtime)\n\n${blocks.join('\n\n')}`;
}
