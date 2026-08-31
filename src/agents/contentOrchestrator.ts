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
import { ITALIAN_COPY_SYSTEM_DIRECTIVE } from '@/lib/marketing/italianCopyGuard';
import { AI_IMAGE_NO_TEXT_DIRECTIVE } from '@/lib/marketing/imagePromptGuard';

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
/**
 * Mappa 1:1 MarketingChannel → Agente Social dedicato + skill.
 * Strategia 100% video basata su micro-clip da 2-3 secondi a loop continuo.
 */
export const CHANNEL_AGENT_REGISTRY: Record<MarketingChannel, ChannelAgentSpec> = {
    [MarketingChannel.META_INSTAGRAM]: {
        agentKey: 'instagram_agent',
        displayName: 'Instagram Agent',
        focus:
            "Copy incentrato sull'emozione, sul valore della memoria e dell'affetto a distanza. Micro-video 9:16 da 2-3s a loop continuo, caroselli estetici Quiet Luxury, feed scansionabile, estetica visiva sobria e testimonianza della posa (foto inviata alla famiglia).",
        skillId: 'instagram_skills',
        skillChannel: 'instagram',
    },
    [MarketingChannel.META_FACEBOOK]: {
        agentKey: 'facebook_agent',
        displayName: 'Facebook Agent',
        focus:
            'Tono caldo e comunitario, narrazione chiara con link al servizio. Post di valore per famiglie, micro-clip 9:16 da 2-3s a loop continuo e copy rassicurante e accessibile per over 60.',
        skillId: 'facebook_skills',
        skillChannel: 'facebook',
    },
    [MarketingChannel.TIKTOK]: {
        agentKey: 'tiktok_agent',
        displayName: 'TikTok Agent',
        focus:
            'Hook iniziale breve e coinvolgente (0–3s), focus su gesti autentici (mani che compongono fiori, legatura nastro seta, posa). Micro-video verticali 9:16 da 2-3s a loop continuo, storytelling emozionale dignitoso, zero griefbait.',
        skillId: 'tiktok_skills',
        skillChannel: 'tiktok',
    },
    [MarketingChannel.YOUTUBE_SHORTS]: {
        agentKey: 'youtube_shorts_agent',
        displayName: 'YouTube Shorts Agent',
        focus:
            'Micro-video verticali 9:16 da 2-3s a loop continuo evergreen, SEO YouTube (titoli ad alto CTR ma onesti), sottotitoli, descrizione keyword-first.',
        skillId: 'youtube_shorts_skills',
        skillChannel: 'youtube_shorts',
    },
    [MarketingChannel.PINTEREST]: {
        agentKey: 'pinterest_agent',
        displayName: 'Pinterest Agent',
        focus:
            'Pin video e verticali 2:3, keyword SEO botaniche/ricorrenze, focus piante e allestimenti tombali, link di spinta al sito. Pubblicazione via src/agents/platforms/pinterestPublisher.ts (OAuth v5 + continuous refresh).',
        skillId: 'pinterest_skills',
        skillChannel: 'pinterest',
    },
    [MarketingChannel.LINKEDIN]: {
        agentKey: 'linkedin_agent',
        displayName: 'LinkedIn Agent',
        focus:
            'Focus su qualità artigianale, affidabilità della rete di fioristi e innovazione del modello di consegna. B2B istituzionale: partnership, welfare aziendale, modello logistico ed etico, tono professionale e autorevole.',
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
   - Una sola idea chiara on-screen; testo overlay solo in post-produzione (ffmpeg/Sharp), MAI generato dall'AI nei pixel del video/foto.

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
      "imagePrompt": "[STYLE]: Quiet Luxury... [LIGHTING]: ... [SUBJECT]: solo scena fotografica floreale... [AVOID]: scritte, loghi, tipografia... ${AI_IMAGE_NO_TEXT_DIRECTIVE}",
      "hashtags": ["#floremoria", "#..."]
    }
  ]
}

Formati: FEED_POST, STORY (max 2 frasi + traino al feed), REEL (script 15–35s verticale).
Per YOUTUBE_SHORTS preferisci REEL; per PINTEREST preferisci FEED_POST (Pin 2:3 nel imagePrompt).

## IMMAGINI — DIVIETO ASSOLUTO TESTO NEI PIXEL
${AI_IMAGE_NO_TEXT_DIRECTIVE}
Mai chiedere slogan, headline, logo o watermark nel imagePrompt. Solo scena fotografica.
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
### Regole LinkedIn (Focus B2B & Rete Fioristi)
- Focus primario su qualità artigianale, affidabilità della rete di fioristi locali e innovazione del modello di consegna etico e tecnologico.
- Tono professionale, autorevole e istituzionale, orientato a partnership B2B, welfare aziendale e logistica di precisione.
- Niente intimismo consumer eccessivo né pathos da social consumer: linguaggio sobrio, chiaro ed elegante.
- Struttura: Apertura sull'innovazione del servizio → Affidabilità e rispetto della rete artigianale fioristi → Call to action per partnership e collaborazioni.
- Hashtag 3–5, professionali (#FloreMoria, #Innovazione, #ArtigianatoItaliano, #LogisticaEtica, #WelfareAziendale).
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
        ITALIAN_COPY_SYSTEM_DIRECTIVE,
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
        ITALIAN_COPY_SYSTEM_DIRECTIVE,
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
        return 'Pin video o verticale 2:3, keyword botaniche/ricorrenze, CTA link al sito; micro-video 2-3s a loop.';
    }
    if (channel === MarketingChannel.YOUTUBE_SHORTS) {
        return 'Short 9:16, titolo ad alto CTR onesto, micro-video 2-3s a loop continuo, SEO in copy/descrizione; imagePrompt 9:16.';
    }
    if (contentFormat === ContentFormat.REEL || channel === MarketingChannel.TIKTOK) {
        return `Micro-video verticale 9:16 da 2-3s a loop continuo — hook 0–3s obbligatorio. Focus agente: ${spec.focus}`;
    }
    if (contentFormat === ContentFormat.STORY) {
        return 'Story 9:16: micro-clip 2-3s a loop + max 2 frasi concise + invito a scoprire il post/servizio.';
    }
    return `Micro-video 9:16 da 2-3s a loop continuo. ${spec.focus}`;
}

/**
 * Regole editoriali specifiche per canale (utili per anteprime e generatori deterministici).
 */
export function getChannelSpecificEditorialRules(channel: MarketingChannel): {
    tone: string;
    hookStyle: string;
    coreValue: string;
    ctaStyle: string;
} {
    switch (channel) {
        case MarketingChannel.META_INSTAGRAM:
            return {
                tone: 'Empatico, caldo, intimo e sobrio (Quiet Luxury).',
                hookStyle: 'Verità emotiva sulla memoria e la vicinanza a distanza.',
                coreValue: 'Valore della memoria, cura costante e testimonianza della posa con foto di conferma.',
                ctaStyle: 'Invito delicato a salvare il post o visitare il link in bio per affidare un ricordo.',
            };
        case MarketingChannel.TIKTOK:
            return {
                tone: 'Autentico, diretto, dinamico e rispettoso (zero melodramma).',
                hookStyle: 'Hook 0-3s su gesti concreti (composizione floreale, nastro di seta, posa).',
                coreValue: 'Trasparenza del servizio e autenticità dei gesti.',
                ctaStyle: 'Salva per la prossima ricorrenza o scopri come funziona senza fretta.',
            };
        case MarketingChannel.META_FACEBOOK:
            return {
                tone: 'Caldo, familiare, comunitario e rassicurante (accessibile a over 60).',
                hookStyle: 'Narrazione familiare e comprensione delle difficoltà della distanza.',
                coreValue: 'Semplicità in tre passi (ordine, consegna accurata, foto di conferma alla famiglia).',
                ctaStyle: 'Link diretto al servizio con invito a commentare o condividere con i parenti.',
            };
        case MarketingChannel.LINKEDIN:
            return {
                tone: 'Istituzionale, autorevole, professionale e orientato al valore.',
                hookStyle: 'Innovazione etica e digitalizzazione della tradizione floreale italiana.',
                coreValue: 'Qualità artigianale, capillarità della rete di fioristi e logistica di precisione.',
                ctaStyle: 'Approfondimento per partnership B2B, accordi di welfare e sinergie con agenzie.',
            };
        case MarketingChannel.YOUTUBE_SHORTS:
            return {
                tone: 'Chiaro, educativo, orientato alla ricerca e al valore permanente.',
                hookStyle: 'Domanda o curiosità botanica/memoriale nei primi 3 secondi.',
                coreValue: 'Tutorial sulla conservazione del ricordo e significato dei fiori.',
                ctaStyle: 'Iscrizione al canale o link in descrizione.',
            };
        case MarketingChannel.PINTEREST:
            return {
                tone: 'Ispirazionale, visivo, focalizzato su estetica floreale e composizioni.',
                hookStyle: 'Composizione botanica ad alta risoluzione.',
                coreValue: 'Ispirazioni floreali per tombe e commemorazioni solenni.',
                ctaStyle: 'Salva il Pin o clicca sul link.',
            };
        default:
            return {
                tone: 'Sobrio e rispettoso.',
                hookStyle: 'Chiaro e immediato.',
                coreValue: 'Presenza e memoria con cura.',
                ctaStyle: 'Scopri il servizio FloreMoria.',
            };
    }
}

