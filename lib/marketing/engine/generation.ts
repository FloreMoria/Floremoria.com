import { GoogleGenAI } from '@google/genai';
import { CampaignStatus, ContentFormat, MarketingChannel } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  buildChannelSystemPrompt,
  describeContentFormatGuidance,
  formatFocusHintForUserPrompt,
  getChannelAgentSpec,
} from '@/src/agents/contentOrchestrator';
import {
  formatLabelForSlot,
  getDailyPublishSlots,
  getRomeCalendarDate,
  type PublishSlot,
} from './contentCalendar';

export interface GeneratedPost {
  campaignId: string;
  channel: MarketingChannel;
  contentFormat: ContentFormat;
  copy: string;
  imagePrompt: string;
  hashtags: string[];
}

export interface CampaignGenerationResult {
  category: 'FF' | 'FT';
  productName: string;
  posts: GeneratedPost[];
}

export class MarketingEngineConfigError extends Error {}

const VALID_CATEGORIES = ['FF', 'FT'] as const;
const VALID_CHANNELS = Object.values(MarketingChannel);
const VALID_FORMATS = Object.values(ContentFormat);

type MarketingCategory = (typeof VALID_CATEGORIES)[number];

interface GeminiGeneratedPost {
  channel: string;
  contentFormat?: string;
  copy: string;
  imagePrompt: string;
  hashtags: string[];
}

interface GeminiCampaignPayload {
  category: string;
  productName: string;
  posts: GeminiGeneratedPost[];
}

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function coerceCategory(value: unknown, fallback: MarketingCategory): MarketingCategory {
  const v = String(value || '').toUpperCase().trim();
  return (VALID_CATEGORIES as readonly string[]).includes(v) ? (v as MarketingCategory) : fallback;
}

function coerceChannel(value: unknown): MarketingChannel | null {
  const v = String(value || '').toUpperCase().trim();
  return (VALID_CHANNELS as string[]).includes(v) ? (v as MarketingChannel) : null;
}

function normalizeHashtags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((tag) =>
      String(tag || '')
        .trim()
        .replace(/^#+/, '')
        .toLowerCase()
    )
    .filter(Boolean)
    .slice(0, 12);
}

function coerceContentFormat(value: unknown): ContentFormat | null {
  const v = String(value || '').toUpperCase().trim();
  return (VALID_FORMATS as string[]).includes(v) ? (v as ContentFormat) : null;
}

function groupSlotsByChannel(slots: PublishSlot[]): Map<MarketingChannel, PublishSlot[]> {
  const map = new Map<MarketingChannel, PublishSlot[]>();
  for (const slot of slots) {
    const list = map.get(slot.channel) ?? [];
    list.push(slot);
    map.set(slot.channel, list);
  }
  return map;
}

function buildUserContentForChannel(
  category: MarketingCategory,
  productName: string,
  productPrice: number,
  channel: MarketingChannel,
  slots: PublishSlot[],
  theme?: string
): string {
  const categoryLabel =
    category === 'FF' ? 'Per il Funerale (FF)' : 'Fiori sulle Tombe (FT)';
  const agent = getChannelAgentSpec(channel);

  const slotLines = slots.map(
    (slot, i) =>
      `${i + 1}. ${formatLabelForSlot(slot)} → channel="${slot.channel}", contentFormat="${slot.contentFormat}" — ${describeContentFormatGuidance(slot.channel, slot.contentFormat)}`
  );

  const lines = [
    `Genera contenuti SOLO per il canale ${channel}, come ${agent.displayName}.`,
    '',
    `Agente: ${formatFocusHintForUserPrompt(channel)}`,
    agent.skillId
      ? `Skill obbligatoria già iniettata nel System Prompt: ${agent.skillId}.md — rispettala alla lettera.`
      : 'Nessuna skill consumer: applica le regole B2B/canale nel System Prompt.',
    '',
    `Categoria: ${categoryLabel}`,
    `Nome prodotto: ${productName}`,
    `Prezzo: €${productPrice.toFixed(2)}`,
    '',
  ];

  if (theme) {
    lines.push(
      `TEMA EDITORIALE DELLA CAMPAGNA: ${theme}`,
      "Adatta rigorosamente il copy e i prompt d'immagine a questo tema, con eleganza e rispetto.",
      ''
    );
  }

  lines.push(
    'Slot editoriali OBBLIGATORI (un post JSON per ciascuno, stessi channel e contentFormat):',
    ...slotLines,
    '',
    'Applica la direttiva di viralità rispettosa (hook 0–3s, CTA salva/condividi, Quiet Luxury).',
    'Rispetta la categoria e adatta tono/immaginario di conseguenza.',
  );

  return lines.join('\n');
}

interface ParsedCampaignPost {
  channel: MarketingChannel;
  contentFormat: ContentFormat;
  copy: string;
  imagePrompt: string;
  hashtags: string[];
}

function parseGeminiCampaignPayload(
  rawText: string,
  fallbackCategory: MarketingCategory,
  fallbackProductName: string,
  requiredSlots: PublishSlot[],
  forcedChannel: MarketingChannel
): Omit<CampaignGenerationResult, 'posts'> & { posts: ParsedCampaignPost[] } {
  let parsed: GeminiCampaignPayload;
  try {
    parsed = JSON.parse(stripJsonFences(rawText)) as GeminiCampaignPayload;
  } catch {
    throw new Error('Risposta Gemini non in formato JSON valido.');
  }

  if (!Array.isArray(parsed.posts) || parsed.posts.length === 0) {
    throw new Error('Risposta Gemini priva di post validi.');
  }

  const category = coerceCategory(parsed.category, fallbackCategory);
  const productName = String(parsed.productName || fallbackProductName).trim() || fallbackProductName;

  const posts: ParsedCampaignPost[] = [];
  for (const post of parsed.posts) {
    const contentFormat = coerceContentFormat(post.contentFormat);
    const copy = String(post.copy || '').trim();
    const imagePrompt = String(post.imagePrompt || '').trim();
    const hashtags = normalizeHashtags(post.hashtags);

    if (!contentFormat || !copy || !imagePrompt) {
      continue;
    }

    // Forza il canale dell’agente preposto (anti-drift multi-canale).
    posts.push({
      channel: forcedChannel,
      contentFormat,
      copy,
      imagePrompt,
      hashtags,
    });
  }

  const aligned: ParsedCampaignPost[] = [];
  for (const slot of requiredSlots) {
    const match =
      posts.find(
        (p) => p.channel === slot.channel && p.contentFormat === slot.contentFormat
      ) ?? posts.find((p) => p.contentFormat === slot.contentFormat) ?? posts[0];

    if (match) {
      aligned.push({
        ...match,
        channel: slot.channel,
        contentFormat: slot.contentFormat,
      });
    }
  }

  if (aligned.length === 0) {
    throw new Error(
      `Nessun post generato per ${forcedChannel} rispetta gli slot editoriali richiesti.`
    );
  }

  return { category, productName, posts: aligned };
}

function getGeminiClient(): { ai: GoogleGenAI; model: string } {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new MarketingEngineConfigError(
      'GEMINI_API_KEY non configurata: impossibile generare la campagna.'
    );
  }
  const model = process.env.MARKETING_GEMINI_MODEL?.trim() || 'gemini-2.5-pro';
  return { ai: new GoogleGenAI({ apiKey }), model };
}

/**
 * Genera gli slot di un singolo canale con Agente dedicato + skill iniettata.
 */
async function generatePostsForChannel(params: {
  category: MarketingCategory;
  productName: string;
  productPrice: number;
  channel: MarketingChannel;
  slots: PublishSlot[];
  theme?: string;
}): Promise<{ category: MarketingCategory; productName: string; posts: ParsedCampaignPost[] }> {
  const { category, productName, productPrice, channel, slots, theme } = params;
  const agent = getChannelAgentSpec(channel);

  console.log(
    `[Marketing Engine] ${agent.displayName} · ${channel} · skill=${agent.skillId ?? 'none'} · ${slots.length} slot`
  );

  // Obbligatorio: caricare skill aggiornata e iniettarla nel System Prompt.
  const systemInstruction = await buildChannelSystemPrompt(channel);
  const { ai, model } = getGeminiClient();

  let rawText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildUserContentForChannel(
        category,
        productName,
        productPrice,
        channel,
        slots,
        theme
      ),
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.5,
      },
    });
    rawText = response.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Errore chiamata Gemini (${agent.displayName}): ${msg}`);
  }

  if (!rawText?.trim()) {
    throw new Error(`Risposta Gemini vuota (${agent.displayName}).`);
  }

  return parseGeminiCampaignPayload(rawText, category, productName, slots, channel);
}

export async function generateCampaignDraft(
  category: 'FF' | 'FT',
  productName: string,
  productPrice: number,
  slots = getDailyPublishSlots(),
  theme?: string
): Promise<CampaignGenerationResult> {
  console.log(
    `[Marketing Engine] Campagna ${category} - ${productName} (${slots.length} slot, tema: ${theme || 'nessuno'}) — orchestrazione per-canale`
  );

  const scheduledFor = getRomeCalendarDate();
  const byChannel = groupSlotsByChannel(slots);

  let resolvedCategory: MarketingCategory = category;
  let resolvedProductName = productName;
  const allPosts: ParsedCampaignPost[] = [];

  for (const [channel, channelSlots] of byChannel) {
    const partial = await generatePostsForChannel({
      category,
      productName,
      productPrice,
      channel,
      slots: channelSlots,
      theme,
    });
    resolvedCategory = partial.category;
    resolvedProductName = partial.productName;
    allPosts.push(...partial.posts);
  }

  if (allPosts.length === 0) {
    throw new Error('Nessun post generato dall’orchestrazione multi-agente.');
  }

  const savedPosts: GeneratedPost[] = [];

  for (const post of allPosts) {
    const campaign = await prisma.marketingCampaign.create({
      data: {
        status: CampaignStatus.DRAFT,
        category: resolvedCategory,
        targetChannel: post.channel,
        contentFormat: post.contentFormat,
        scheduledFor,
        copy: post.copy,
        imageUrl: '',
        imagePrompt: post.imagePrompt,
        hashtags: post.hashtags,
      },
    });

    savedPosts.push({
      campaignId: campaign.id,
      channel: campaign.targetChannel,
      contentFormat: campaign.contentFormat,
      copy: campaign.copy,
      imagePrompt: post.imagePrompt,
      hashtags: campaign.hashtags,
    });
  }

  return {
    category: resolvedCategory,
    productName: resolvedProductName,
    posts: savedPosts,
  };
}

/**
 * Rigenera un singolo post social precedentemente bocciato dai Guardiani,
 * con Agente + skill del canale target.
 */
export async function regenerateCampaignDraftWithFeedback(
  campaignId: string,
  feedback: string
): Promise<void> {
  console.log(`[Marketing Engine] Rigenerazione campagna ${campaignId} con feedback dei Guardiani`);

  const campaign = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new Error(`Campagna ${campaignId} non trovata per rigenerazione.`);
  }

  const agent = getChannelAgentSpec(campaign.targetChannel);
  const { ai, model } = getGeminiClient();

  // Skill obbligatoria per il canale del post da correggere.
  const systemInstruction = `${await buildChannelSystemPrompt(campaign.targetChannel)}

Hai precedentemente generato un post che è stato RIFIUTATO dal comitato Guardiani (ALMA, SOFIA, MARTINA, BARBARA, PROF).
Riformula copy, imagePrompt e hashtag risolvendo TUTTI i problemi, restando ${agent.displayName} su ${campaign.targetChannel}.

Restituisci ESCLUSIVAMENTE JSON:
{
  "copy": "Copy corretto...",
  "imagePrompt": "Prompt immagine corretto...",
  "hashtags": ["hashtag1", "hashtag2"]
}
`;

  const userContent = `
DATI ORIGINARI DEL POST:
Agente: ${agent.displayName}
Canale: ${campaign.targetChannel}
Formato: ${campaign.contentFormat}
Copy originario: ${campaign.copy}
Prompt immagine originario: ${campaign.imagePrompt || '(nessuno)'}
Hashtag originari: ${campaign.hashtags.join(', ')}

FEEDBACK E INDICAZIONI DI CORREZIONE DEI GUARDIANI:
"${feedback}"

Genera ora la versione corretta in formato JSON.
`;

  let rawText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: userContent,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    });
    rawText = response.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Errore chiamata Gemini durante la rigenerazione: ${msg}`);
  }

  if (!rawText?.trim()) {
    throw new Error('Risposta Gemini vuota durante la rigenerazione.');
  }

  interface GeminiRegenerationPayload {
    copy: string;
    imagePrompt: string;
    hashtags: string[];
  }

  let parsed: GeminiRegenerationPayload;
  try {
    parsed = JSON.parse(stripJsonFences(rawText)) as GeminiRegenerationPayload;
  } catch {
    throw new Error('Risposta Gemini per rigenerazione non in formato JSON valido.');
  }

  const copy = String(parsed.copy || '').trim();
  const imagePrompt = String(parsed.imagePrompt || '').trim();
  const hashtags = normalizeHashtags(parsed.hashtags);

  if (!copy || !imagePrompt) {
    throw new Error('La rigenerazione ha restituito copy o prompt immagine vuoti.');
  }

  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: {
      copy,
      imagePrompt,
      hashtags,
      imageUrl: '',
      status: CampaignStatus.DRAFT,
      rejectionReason: null,
    },
  });

  console.log(`[Marketing Engine] Campagna ${campaignId} riscritta da ${agent.displayName} → DRAFT.`);
}
