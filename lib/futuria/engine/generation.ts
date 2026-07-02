import { GoogleGenAI } from '@google/genai';
import { CampaignStatus, MarketingChannel } from '@prisma/client';
import prisma from '@/lib/prisma';

export interface GeneratedPost {
  campaignId: string;
  channel: MarketingChannel;
  copy: string;
  imagePrompt: string;
  hashtags: string[];
}

export interface CampaignGenerationResult {
  category: 'FF' | 'FT';
  productName: string;
  posts: GeneratedPost[];
}

export class FuturiaEngineConfigError extends Error {}

const VALID_CATEGORIES = ['FF', 'FT'] as const;
const VALID_CHANNELS = Object.values(MarketingChannel);

type FuturiaCategory = (typeof VALID_CATEGORIES)[number];

interface GeminiGeneratedPost {
  channel: string;
  copy: string;
  imagePrompt: string;
  hashtags: string[];
}

interface GeminiCampaignPayload {
  category: string;
  productName: string;
  posts: GeminiGeneratedPost[];
}

// Prompt di sistema macro che istruisce lo sciame creativo
const CREATIVE_SWARM_SYSTEM_PROMPT = `
Tu sei il Core Creativo di FloreMoria (Progetto Futuria), un'orchestra di Agent AI specializzati che lavorano in sequenza per creare campagne di marketing d'élite. Non lasciare nulla al caso.

Agisci impersonando contemporaneamente queste competenze:
1. CLEO (Content Strategist): Scrivi copy sublimi. Per Instagram/Facebook usa un tono caldo, empatico, intimo e B2C (focalizzato sul ricordo). Per LinkedIn usa un tono istituzionale, solenne, professionale e B2B (focalizzato su rispetto e partnership).
2. ZIGGY & ARLO (Art Direction): Progetta prompt d'immagine in stile "Quiet Luxury". Luce naturale (ora d'oro o finestra nord), palette desaturate ed eleganti (avorio, salvia, cipria, terracotta), profondità di campo ridotta, bokeh naturale. Bandisci grafiche, scritte, loghi e l'effetto "stock photo triste". I fiori devono apparire veri, freschi e bagnati di luce reale.
3. AXEL (SEO/AEO Specialist): Estrai hashtag pertinenti ed eleganti, evitando liste chilometriche e spam.
4. NINA (Visual Impact): Assicurati che la struttura del testo sia scansionabile da mobile, con interlinee pulite e senza abuso di emoji.

INPUT RICHIESTO:
Riceverai una categoria (FF = Per il Funerale, FT = Fiori sulle Tombe) e i dettagli di un prodotto floreale.

OUTPUT RICHIESTO:
Devi restituire MANDATORIAMENTE ed ESCLUSIVAMENTE un oggetto JSON valido (senza blocchi di testo esterni) che contenga un array di post ottimizzati per i canali richiesti (META_INSTAGRAM, META_FACEBOOK, LINKEDIN).

Struttura del JSON atteso:
{
  "category": "FF o FT",
  "productName": "Nome prodotto",
  "posts": [
    {
      "channel": "META_INSTAGRAM",
      "copy": "Testo emotivo...",
      "imagePrompt": "[STYLE]: Quiet Luxury... [LIGHTING]: ... [SUBJECT]: ... [AVOID]: ...",
      "hashtags": ["#floremoria", "#..."]
    }
  ]
}
`;

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function coerceCategory(value: unknown, fallback: FuturiaCategory): FuturiaCategory {
  const v = String(value || '').toUpperCase().trim();
  return (VALID_CATEGORIES as readonly string[]).includes(v) ? (v as FuturiaCategory) : fallback;
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

function buildUserContent(category: FuturiaCategory, productName: string, productPrice: number): string {
  const categoryLabel =
    category === 'FF' ? 'Per il Funerale (FF)' : 'Fiori sulle Tombe (FT)';

  return [
    'Genera una campagna multicanale per il prodotto seguente.',
    '',
    `Categoria: ${categoryLabel}`,
    `Nome prodotto: ${productName}`,
    `Prezzo: €${productPrice.toFixed(2)}`,
    '',
    'Canali obbligatori: META_INSTAGRAM, META_FACEBOOK, LINKEDIN (un post per ciascun canale).',
    'Rispetta la categoria indicata e adatta tono e immaginario di conseguenza.',
  ].join('\n');
}

interface ParsedCampaignPost {
  channel: MarketingChannel;
  copy: string;
  imagePrompt: string;
  hashtags: string[];
}

function parseGeminiCampaignPayload(
  rawText: string,
  fallbackCategory: FuturiaCategory,
  fallbackProductName: string
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
    const channel = coerceChannel(post.channel);
    const copy = String(post.copy || '').trim();
    const imagePrompt = String(post.imagePrompt || '').trim();
    const hashtags = normalizeHashtags(post.hashtags);

    if (!channel || !copy || !imagePrompt) {
      continue;
    }

    posts.push({ channel, copy, imagePrompt, hashtags });
  }

  if (posts.length === 0) {
    throw new Error('Nessun post generato rispetta i canali e i campi obbligatori.');
  }

  return { category, productName, posts };
}

export async function generateCampaignDraft(
  category: 'FF' | 'FT',
  productName: string,
  productPrice: number
): Promise<CampaignGenerationResult> {
  console.log(`[Futuria Engine] Chiamata API Gemini per ${category} - ${productName}`);

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new FuturiaEngineConfigError(
      'GEMINI_API_KEY non configurata: impossibile generare la campagna.'
    );
  }

  const model = process.env.FUTURIA_GEMINI_MODEL?.trim() || 'gemini-2.5-pro';
  const ai = new GoogleGenAI({ apiKey });

  let rawText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildUserContent(category, productName, productPrice),
      config: {
        systemInstruction: CREATIVE_SWARM_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.5,
      },
    });
    rawText = response.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Errore chiamata Gemini: ${msg}`);
  }

  if (!rawText?.trim()) {
    throw new Error('Risposta Gemini vuota.');
  }

  const result = parseGeminiCampaignPayload(rawText, category, productName);

  const savedPosts: GeneratedPost[] = [];

  for (const post of result.posts) {
    const campaign = await prisma.marketingCampaign.create({
      data: {
        status: CampaignStatus.DRAFT,
        category: result.category,
        targetChannel: post.channel,
        copy: post.copy,
        imageUrl: '',
        imagePrompt: post.imagePrompt,
        hashtags: post.hashtags,
      },
    });

    savedPosts.push({
      campaignId: campaign.id,
      channel: campaign.targetChannel,
      copy: campaign.copy,
      imagePrompt: post.imagePrompt,
      hashtags: campaign.hashtags,
    });
  }

  return {
    category: result.category,
    productName: result.productName,
    posts: savedPosts,
  };
}
