import { GoogleGenAI } from '@google/genai';
import { CampaignStatus, ContentFormat, MarketingChannel } from '@prisma/client';
import prisma from '@/lib/prisma';
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

// Prompt di sistema macro che istruisce lo sciame creativo secondo le direttive di ZIGGY
const CREATIVE_SWARM_SYSTEM_PROMPT = `
Tu sei il Core Creativo di FloreMoria, un'orchestra di Agent AI specializzati che lavorano in sequenza per creare campagne di marketing d'élite.
Agisci come ZIGGY, l'Agent AI Creative Content Director di FloreMoria, ed imposta la linea editoriale e le regole per le diverse piattaforme:

1. CLEO (Content Strategist) + ZIGGY Platform Rules:
   - META_INSTAGRAM: Tono caldo, intimo, empatico, sobrio, incentrato sul dolore della distanza. Taglia i testi per mobile, usa paragrafi corti e scansionabili. Inserisci una Call to Action (CTA) discreta che dia sollievo ed eviti toni commerciali.
   - META_FACEBOOK: Tono rassicurante, affettuoso, orientato alla vicinanza familiare. Copy leggermente più narrativo e disteso rispetto a Instagram, focalizzato sul ricordo continuo dei propri cari e sull'affidabilità del servizio.
   - LINKEDIN: Tono professionale, solenne, istituzionale e B2B. Focalizzato su partnership, welfare aziendale e rispetto per la memoria come valore aziendale e sociale. Linguaggio formale ed elevato.
   - TIKTOK: Tono autentico, dinamico e umano (UGC-feel). Hook forte nei primi 2 secondi (es. 'Come facciamo a portare un fiore a chi amiamo se siamo lontani?'), struttura rigida Hook -> Body -> Close con linguaggio colloquiale e rispettoso.

2. ZIGGY & ARLO (Art Direction):
   - Progetta prompt d'immagine in stile "Quiet Luxury". Luce naturale (ora d'oro o finestra nord), palette desaturate ed eleganti (avorio, salvia, cipria, terracotta), profondità di campo ridotta, bokeh naturale.
   - Bandisci grafiche, scritte, loghi, persone in posa ed estetismo artificiale/stock kitsch. I fiori devono apparire reali.
   - Per TikTok, crea prompt adatti a video verticali (9:16) dinamici o scene di composizione manuale/POV.

3. AXEL (SEO/AEO Specialist):
   - Seleziona solo hashtag pertinenti ed eleganti (max 4-5 per post, senza liste chilometriche).

4. NINA (Visual Impact):
   - Assicurati che l'impaginazione sia pulita, ordinata e senza abuso di emoji (max 1-2 per post, solo se sobrie).

INPUT RICHIESTO:
Riceverai una categoria (FF = Per il Funerale, FT = Fiori sulle Tombe) e i dettagli di un prodotto floreale.

OUTPUT RICHIESTO:
Devi restituire MANDATORIAMENTE ed ESCLUSIVAMENTE un oggetto JSON valido (senza blocchi di testo esterni) con un post per OGNI slot editoriale richiesto.

Struttura del JSON atteso:
{
  "category": "FF o FT",
  "productName": "Nome prodotto",
  "posts": [
    {
      "channel": "META_INSTAGRAM",
      "contentFormat": "FEED_POST",
      "copy": "Testo emotivo...",
      "imagePrompt": "[STYLE]: Quiet Luxury... [LIGHTING]: ... [SUBJECT]: ... [AVOID]: ...",
      "hashtags": ["#floremoria", "#..."]
    }
  ]
}

Canali ammessi: META_INSTAGRAM, META_FACEBOOK, TIKTOK, LINKEDIN.
Formati ammessi: FEED_POST (post feed), STORY (story verticale che rimanda al post/reel del giorno), REEL (script reel breve e dinamico).
Per STORY usa copy più corto (max 2 frasi + invito a vedere il feed). Per REEL copy energico adatto a video verticale 15-30s.
`;

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

function buildUserContent(
  category: MarketingCategory,
  productName: string,
  productPrice: number,
  slots: PublishSlot[],
  theme?: string
): string {
  const categoryLabel =
    category === 'FF' ? 'Per il Funerale (FF)' : 'Fiori sulle Tombe (FT)';

  const slotLines = slots.map(
    (slot, i) =>
      `${i + 1}. ${formatLabelForSlot(slot)} → channel="${slot.channel}", contentFormat="${slot.contentFormat}"`
  );

  const lines = [
    'Genera una campagna multicanale per il prodotto seguente.',
    '',
    `Categoria: ${categoryLabel}`,
    `Nome prodotto: ${productName}`,
    `Prezzo: €${productPrice.toFixed(2)}`,
    '',
  ];

  if (theme) {
    lines.push(
      `TEMA EDITORIALE DELLA CAMPAGNA: ${theme}`,
      "Adatta rigorosamente il copy e i prompt d'immagine a questo tema specifico, in modo da integrarlo elegantemente.",
      ''
    );
  }

  lines.push(
    'Slot editoriali OBBLIGATORI (un post JSON per ciascuno, stessi channel e contentFormat):',
    ...slotLines,
    '',
    'Rispetta la categoria indicata e adatta tono e immaginario di conseguenza.',
    'TikTok: tono autentico, empatico, adatto a un pubblico più giovane ma sempre rispettoso.',
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
  requiredSlots: PublishSlot[]
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
    const contentFormat = coerceContentFormat(post.contentFormat);
    const copy = String(post.copy || '').trim();
    const imagePrompt = String(post.imagePrompt || '').trim();
    const hashtags = normalizeHashtags(post.hashtags);

    if (!channel || !contentFormat || !copy || !imagePrompt) {
      continue;
    }

    posts.push({ channel, contentFormat, copy, imagePrompt, hashtags });
  }

  // Allinea agli slot richiesti (ordine editoriale)
  const aligned: ParsedCampaignPost[] = [];
  for (const slot of requiredSlots) {
    const match =
      posts.find(
        (p) => p.channel === slot.channel && p.contentFormat === slot.contentFormat
      ) ?? posts.find((p) => p.channel === slot.channel);

    if (match) {
      aligned.push({
        ...match,
        channel: slot.channel,
        contentFormat: slot.contentFormat,
      });
    }
  }

  if (aligned.length === 0) {
    throw new Error('Nessun post generato rispetta gli slot editoriali richiesti.');
  }

  return { category, productName, posts: aligned };
}

export async function generateCampaignDraft(
  category: 'FF' | 'FT',
  productName: string,
  productPrice: number,
  slots = getDailyPublishSlots(),
  theme?: string
): Promise<CampaignGenerationResult> {
  console.log(
    `[Marketing Engine] Chiamata API Gemini per ${category} - ${productName} (${slots.length} slot, tema: ${theme || 'nessuno'})`
  );

  const scheduledFor = getRomeCalendarDate();

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new MarketingEngineConfigError(
      'GEMINI_API_KEY non configurata: impossibile generare la campagna.'
    );
  }

  const model =
    process.env.MARKETING_GEMINI_MODEL?.trim() ||
    'gemini-2.5-pro';
  const ai = new GoogleGenAI({ apiKey });

  let rawText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildUserContent(category, productName, productPrice, slots, theme),
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

  const result = parseGeminiCampaignPayload(rawText, category, productName, slots);

  const savedPosts: GeneratedPost[] = [];

  for (const post of result.posts) {
    const campaign = await prisma.marketingCampaign.create({
      data: {
        status: CampaignStatus.DRAFT,
        category: result.category,
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
    category: result.category,
    productName: result.productName,
    posts: savedPosts,
  };
}

/**
 * Rigenera un singolo post social precedentemente bocciato dai Guardiani,
 * applicando le indicazioni correttive e riportando lo stato in DRAFT.
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

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new MarketingEngineConfigError(
      'GEMINI_API_KEY non configurata: impossibile rigenerare la campagna.'
    );
  }

  const model =
    process.env.MARKETING_GEMINI_MODEL?.trim() ||
    'gemini-2.5-pro';
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
Tu sei l'Agent AI ZIGGY, Creative Content Director di FloreMoria.
Hai precedentemente generato un post social che è stato RIFIUTATO dal comitato di controllo dei Guardiani (ALMA, SOFIA, MARTINA, BARBARA, PROF).
Il tuo compito è RIFORMULARE il copy, il prompt d'immagine e gli hashtag per risolvere TUTTI i problemi riscontrati, rispettando rigorosamente le indicazioni correttive fornite.

Mantieni l'estetica "Quiet Luxury" ed i requisiti della piattaforma originaria (${campaign.targetChannel}).
Devi restituire MANDATORIAMENTE ed ESCLUSIVAMENTE un oggetto JSON valido con la seguente struttura:
{
  "copy": "Copy corretto...",
  "imagePrompt": "Prompt immagine corretto...",
  "hashtags": ["hashtag1", "hashtag2", ...]
}
`;

  const userContent = `
DATI ORIGINARI DEL POST:
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

  // Aggiorna Prisma con i dati corretti e riporta lo stato in DRAFT
  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: {
      copy,
      imagePrompt,
      hashtags,
      imageUrl: '', // Reset imageUrl per innescare nuova generazione di Imagen
      status: CampaignStatus.DRAFT,
      rejectionReason: null,
    },
  });

  console.log(`[Marketing Engine] Campagna ${campaignId} riscritta e ripristinata in DRAFT.`);
}
