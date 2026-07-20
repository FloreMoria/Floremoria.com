/**
 * Orchestrazione contenuti social: ogni canale è gestito dal suo Agente dedicato
 * e DEVE caricare la skill Markdown aggiornata via skillsLoader prima della generazione.
 *
 * Non altera i 22 Agent master: è un layer runtime additivo su ZIGGY/CLEO.
 */
import { MarketingChannel, ContentFormat } from '@prisma/client';
import {
    injectSkillsIntoSystemPrompt,
    type SkillChannel,
    type SocialSkillId,
} from '@/src/agents/skillsLoader';

export type SocialAgentKey =
    | 'instagram_agent'
    | 'facebook_agent'
    | 'tiktok_agent'
    | 'youtube_shorts_agent'
    | 'pinterest_agent'
    | 'linkedin_agent'
    | 'google_ads_agent';

export type ChannelAgentSpec = {
    agentKey: SocialAgentKey;
    displayName: string;
    /** Focus operativo dell’agente (iniettato nel System Prompt). */
    focus: string;
    /** Skill canale; null = nessun file skill (es. LinkedIn B2B). */
    skillId: SocialSkillId | null;
    skillChannel: SkillChannel | null;
};

/**
 * Mappa 1:1 MarketingChannel → Agente Social dedicato + skill.
 * Perché: ogni canale ha regole, formati e CTR diversi; una sola voce “ZIGGY”
 * non basta a rispettare le skill per-canale.
 */
export const CHANNEL_AGENT_REGISTRY: Record<MarketingChannel, ChannelAgentSpec> = {
    [MarketingChannel.META_INSTAGRAM]: {
        agentKey: 'instagram_agent',
        displayName: 'Instagram Agent',
        focus:
            'Reels 9:16, caroselli estetici Quiet Luxury, feed scansionabile, estetica visiva sobria e testimonianza della posa.',
        skillId: 'instagram_skills',
        skillChannel: 'instagram',
    },
    [MarketingChannel.META_FACEBOOK]: {
        agentKey: 'facebook_agent',
        displayName: 'Facebook Agent',
        focus:
            'Post di valore per famiglie, storie community, discussioni gentili, copy narrativo e rassicurante (accessibile over 60).',
        skillId: 'facebook_skills',
        skillChannel: 'facebook',
    },
    [MarketingChannel.TIKTOK]: {
        agentKey: 'tiktok_agent',
        displayName: 'TikTok Agent',
        focus:
            'Hook 0–3s obbligatorio, video verticali 9:16, trend audio rispettosi (mai griefbait), storytelling emozionale dignitoso.',
        skillId: 'tiktok_skills',
        skillChannel: 'tiktok',
    },
    [MarketingChannel.YOUTUBE_SHORTS]: {
        agentKey: 'youtube_shorts_agent',
        displayName: 'YouTube Shorts Agent',
        focus:
            'Video verticali 9:16 evergreen, SEO YouTube (titoli ad alto CTR ma onesti), sottotitoli, descrizione keyword-first.',
        skillId: 'youtube_shorts_skills',
        skillChannel: 'youtube_shorts',
    },
    [MarketingChannel.PINTEREST]: {
        agentKey: 'pinterest_agent',
        displayName: 'Pinterest Agent',
        focus:
            'Pin verticali 2:3, keyword SEO botaniche/ricorrenze, focus piante e allestimenti tombali, link di spinta al sito.',
        skillId: 'pinterest_skills',
        skillChannel: 'pinterest',
    },
    [MarketingChannel.LINKEDIN]: {
        agentKey: 'linkedin_agent',
        displayName: 'LinkedIn Agent',
        focus:
            'B2B istituzionale: partnership, welfare, innovazione, tono formale. Nessuna skill consumer dedicata.',
        skillId: null,
        skillChannel: null,
    },
    [MarketingChannel.GOOGLE_ADS]: {
        agentKey: 'google_ads_agent',
        displayName: 'Google Ads Agent',
        focus: 'Paid search/display (fuori scope skill organiche).',
        skillId: null,
        skillChannel: null,
    },
};

/**
 * Direttiva obbligatoria: viralità rispettosa + elevato CTR.
 * Perché: massimizzare salvataggi/condivisioni senza dark pattern sul dolore.
 */
export const VIRALITY_RESPECTFUL_DIRECTIVE = `
## DIRETTIVA OBBLIGATORIA — Viralità rispettosa & elevato CTR

Obiettivo: massimizzare interazioni utili (salvataggi, condivisioni, commenti genuini, click al sito)
senza mai speculare sul dolore o usare urgenza artificiale.

1. HOOK NEI PRIMI 3 SECONDI (Reels / Shorts / TikTok / video verticali):
   - Fermare lo scroll con curiosità botanica, significato dei fiori, segreti di manutenzione,
     storie di cura e presenza a distanza — mai griefbait o shock.
   - Una sola idea chiara on-screen; testo grande, contrasto alto.

2. CTA ORIENTATA A SALVATAGGIO / CONDIVISIONE (oltre al sito, dove coerente):
   - Esempi ammessi: "Salva questo video per la prossima ricorrenza",
     "Inoltra a chi vive lontano", "Salva il Pin per quando servirà un gesto dignitoso".
   - CTA soft verso www.floremoria.com nei feed/reel dove previsto dal calendario.

3. LINGUAGGIO & ESTETICA FLOREMORIA:
   - Eleganza Quiet Luxury, empatia adulta, rispetto del ricordo (SOFIA + ALMA).
   - Vietati: countdown, FOMO sul lutto, "ultima chance", melodramma, ironia sul funerale.

Misura il successo come CTR dignitoso + retention + salvataggi, non come clickbait.
`.trim();

const OUTPUT_JSON_CONTRACT = `
## OUTPUT JSON (obbligatorio)

Restituisci ESCLUSIVAMENTE un oggetto JSON valido:
{
  "category": "FF o FT",
  "productName": "Nome prodotto",
  "posts": [
    {
      "channel": "META_INSTAGRAM | META_FACEBOOK | TIKTOK | YOUTUBE_SHORTS | PINTEREST | LINKEDIN",
      "contentFormat": "FEED_POST | STORY | REEL",
      "copy": "Testo / script",
      "imagePrompt": "[STYLE]: Quiet Luxury... [LIGHTING]: ... [SUBJECT]: ... [AVOID]: ...",
      "hashtags": ["#floremoria", "#..."]
    }
  ]
}

Formati: FEED_POST, STORY (max 2 frasi + traino al feed), REEL (script 15–35s verticale).
Per YOUTUBE_SHORTS preferisci REEL; per PINTEREST preferisci FEED_POST (Pin 2:3 nel imagePrompt).
`.trim();

export function getChannelAgentSpec(channel: MarketingChannel): ChannelAgentSpec {
    return CHANNEL_AGENT_REGISTRY[channel];
}

export function getSkillIdForMarketingChannel(channel: MarketingChannel): SocialSkillId | null {
    return CHANNEL_AGENT_REGISTRY[channel]?.skillId ?? null;
}

function buildAgentIdentityBlock(spec: ChannelAgentSpec, channel: MarketingChannel): string {
    return [
        `## Agente preposto (obbligatorio)`,
        `Stai operando ESCLUSIVAMENTE come **${spec.displayName}** (\`${spec.agentKey}\`) per il canale \`${channel}\`.`,
        `Non generare contenuti per altri canali in questa sessione.`,
        '',
        `### Focus operativo`,
        spec.focus,
        '',
        `### Coordinamento`,
        `ZIGGY resta Creative Director di riferimento; CLEO allinea il tema; ARLO/NINA guidano Quiet Luxury; AXEL gli hashtag.`,
        `Tu, ${spec.displayName}, sei l’unica voce autorizzata a scrivere copy/script/prompt per questo canale.`,
    ].join('\n');
}

const LINKEDIN_FALLBACK_RULES = `
### Regole LinkedIn (senza skill file)
- Tono professionale, istituzionale, orientato a partnership e welfare.
- Niente intimismo consumer eccessivo; linguaggio elevato e chiaro.
- Hashtag 3–4, sobri.
`.trim();

/**
 * Costruisce il System Prompt per UN canale: identità agente + skill .md + viralità.
 * DEVE essere chiamato prima di ogni generazione/rigenerazione per quel social.
 */
export async function buildChannelSystemPrompt(channel: MarketingChannel): Promise<string> {
    const spec = getChannelAgentSpec(channel);
    const base = [
        `Tu sei il Core Creativo di FloreMoria orchestrato per canale.`,
        buildAgentIdentityBlock(spec, channel),
        '',
        VIRALITY_RESPECTFUL_DIRECTIVE,
        '',
        OUTPUT_JSON_CONTRACT,
    ].join('\n');

    if (!spec.skillId) {
        const extra =
            channel === MarketingChannel.LINKEDIN ? `\n\n${LINKEDIN_FALLBACK_RULES}` : '';
        return `${base}${extra}`;
    }

    return injectSkillsIntoSystemPrompt(base, [spec.skillId]);
}

/**
 * Per batch multi-canale: concatena gli agenti e le skill di tutti i canali presenti negli slot.
 * Preferire `buildChannelSystemPrompt` per generazione 1:1 rigorosa.
 */
export async function buildMultiChannelSystemPrompt(
    channels: MarketingChannel[]
): Promise<string> {
    const unique = [...new Set(channels)];
    const blocks: string[] = [
        'Tu sei il Core Creativo di FloreMoria. Ogni post deve essere scritto dal suo Agente Social dedicato.',
        '',
        VIRALITY_RESPECTFUL_DIRECTIVE,
        '',
        '## Agenti assegnati in questo batch',
    ];

    const skillIds: SocialSkillId[] = [];
    for (const channel of unique) {
        const spec = getChannelAgentSpec(channel);
        blocks.push(
            `- **${spec.displayName}** → \`${channel}\` — ${spec.focus}` +
                (spec.skillId ? ` — skill: \`${spec.skillId}.md\`` : ' — nessuna skill consumer')
        );
        if (spec.skillId) skillIds.push(spec.skillId);
    }

    blocks.push('', OUTPUT_JSON_CONTRACT);
    if (unique.includes(MarketingChannel.LINKEDIN)) {
        blocks.push('', LINKEDIN_FALLBACK_RULES);
    }

    const base = blocks.join('\n');
    if (skillIds.length === 0) return base;
    return injectSkillsIntoSystemPrompt(base, skillIds);
}

export function formatFocusHintForUserPrompt(channel: MarketingChannel): string {
    const spec = getChannelAgentSpec(channel);
    return `${spec.displayName}: ${spec.focus}`;
}

export function describeContentFormatGuidance(
    channel: MarketingChannel,
    contentFormat: ContentFormat
): string {
    const spec = getChannelAgentSpec(channel);
    if (channel === MarketingChannel.PINTEREST) {
        return 'Pin verticale 2:3, keyword botaniche/ricorrenze, CTA link al sito; imagePrompt deve specificare ratio 2:3.';
    }
    if (channel === MarketingChannel.YOUTUBE_SHORTS) {
        return 'Short 9:16, titolo ad alto CTR onesto, SEO in copy/descrizione, sottotitoli; imagePrompt 9:16.';
    }
    if (contentFormat === ContentFormat.REEL || channel === MarketingChannel.TIKTOK) {
        return `Video verticale 9:16 — hook 0–3s obbligatorio. Focus agente: ${spec.focus}`;
    }
    if (contentFormat === ContentFormat.STORY) {
        return 'Story breve: max 2 frasi + invito a vedere il post/reel del giorno sul profilo.';
    }
    return spec.focus;
}
