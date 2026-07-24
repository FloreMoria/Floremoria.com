/**
 * Genera copy + hashtag per un post manuale analizzando foto/video (frame)
 * con Gemini, allineato all’agente del canale (SOFIA + ALMA).
 */
import { GoogleGenAI } from '@google/genai';
import { ContentFormat, MarketingChannel } from '@prisma/client';
import {
  buildChannelSystemPrompt,
  getChannelAgentSpec,
} from '@/src/agents/contentOrchestrator';
import {
  buildSocialProofCopy,
  type SocialProofCategoryCode,
} from '@/lib/marketing/socialProofCopy';

export type SuggestManualPostCopyResult = {
  copy: string;
  hashtags: string[];
  category: SocialProofCategoryCode;
  source: 'gemini' | 'fallback';
};

const CHANNEL_VALUES = new Set<string>(Object.values(MarketingChannel));
const FORMAT_VALUES = new Set<string>(Object.values(ContentFormat));

function getGeminiClient(): { ai: GoogleGenAI; model: string } {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non configurata: impossibile analizzare il media.');
  }
  const model =
    process.env.MARKETING_VISION_MODEL?.trim() ||
    process.env.MARKETING_GEMINI_MODEL?.trim() ||
    'gemini-2.5-flash';
  return { ai: new GoogleGenAI({ apiKey }), model };
}

function normalizeHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t || '').trim().replace(/^#+/, '').toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function parseSuggestPayload(rawText: string): {
  copy: string;
  hashtags: string[];
  category: SocialProofCategoryCode;
} | null {
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const copy = typeof parsed.copy === 'string' ? parsed.copy.trim() : '';
    if (!copy) return null;
    const cat = String(parsed.category || 'FT').toUpperCase();
    const category: SocialProofCategoryCode =
      cat === 'FF' || cat === 'FT' || cat === 'FA' || cat === 'FP' ? cat : 'FT';
    return {
      copy,
      hashtags: normalizeHashtags(parsed.hashtags),
      category,
    };
  } catch {
    return null;
  }
}

function channelCopyGuidance(channel: MarketingChannel, contentFormat: ContentFormat): string {
  const agent = getChannelAgentSpec(channel);
  const lengthHint =
    contentFormat === ContentFormat.STORY
      ? 'Max 2 frasi corte.'
      : contentFormat === ContentFormat.REEL ||
          channel === MarketingChannel.TIKTOK ||
          channel === MarketingChannel.YOUTUBE_SHORTS
        ? 'Script breve stile vertical video (hook nei primi secondi, 2–4 frasi).'
        : channel === MarketingChannel.PINTEREST
          ? 'Titolo/descrizione Pin SEO-friendly, 1–3 frasi + keyword botaniche.'
          : channel === MarketingChannel.LINKEDIN
            ? 'Tono B2B istituzionale, 3–5 frasi.'
            : 'Copy feed 2–5 frasi, Quiet Luxury.';

  return [
    `Canale: ${channel} (${agent.displayName}).`,
    `Formato: ${contentFormat}.`,
    `Focus: ${agent.focus}`,
    lengthHint,
    'Hashtag 3–6, senza # nel JSON (solo parole), in italiano o brand.',
    'Niente dark pattern, niente urgenza sul dolore, niente griefbait (SOFIA + ALMA).',
    'Categoria: FF=funerale, FT=tombe/cimitero, FA=animali, FP=accessori/piante.',
  ].join('\n');
}

/**
 * Analizza un’immagine (o frame video) e propone copy + hashtag per il canale.
 */
export async function suggestManualPostCopy(params: {
  channel: string;
  contentFormat: string;
  mediaBuffer: Buffer;
  mimeType: string;
  fileName?: string;
  isVideoFrame?: boolean;
}): Promise<SuggestManualPostCopyResult> {
  const channel = CHANNEL_VALUES.has(params.channel)
    ? (params.channel as MarketingChannel)
    : MarketingChannel.META_INSTAGRAM;
  const contentFormat = FORMAT_VALUES.has(params.contentFormat)
    ? (params.contentFormat as ContentFormat)
    : ContentFormat.FEED_POST;

  const fallback = (): SuggestManualPostCopyResult => {
    const pack = buildSocialProofCopy('FT');
    return {
      copy: pack.copy,
      hashtags: pack.hashtags,
      category: pack.category,
      source: 'fallback',
    };
  };

  try {
    const systemInstruction = await buildChannelSystemPrompt(channel);
    const { ai, model } = getGeminiClient();
    const base64 = params.mediaBuffer.toString('base64');
    const mimeType = params.mimeType.startsWith('image/')
      ? params.mimeType
      : 'image/jpeg';

    const userText = [
      'Analizza il media FloreMoria e scrivi il post per il canale indicato.',
      params.isVideoFrame
        ? 'Il media è un fotogramma estratto da un video: descrivi la scena e adatta il copy al formato video.'
        : 'Il media è una foto.',
      params.fileName ? `Nome file: ${params.fileName}` : '',
      channelCopyGuidance(channel, contentFormat),
      '',
      'Rispondi SOLO con JSON valido:',
      '{"category":"FT","copy":"...","hashtags":["floremoria","..."]}',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: userText },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.45,
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) return fallback();

    const parsed = parseSuggestPayload(rawText);
    if (!parsed) return fallback();

    if (parsed.hashtags.length === 0) {
      parsed.hashtags = buildSocialProofCopy(parsed.category).hashtags;
    }

    return { ...parsed, source: 'gemini' };
  } catch (err) {
    console.error('[suggestManualPostCopy]', err instanceof Error ? err.message : err);
    return fallback();
  }
}
