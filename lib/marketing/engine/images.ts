import { GoogleGenAI } from '@google/genai';
import { ContentFormat, MarketingChannel } from '@prisma/client';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import prisma from '@/lib/prisma';
import { MarketingEngineConfigError } from './generation';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

async function overlayLogo(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const logoPath = resolve(process.cwd(), 'public/images/brand/Logo FloreMoria ESTESO senza fondo 100x290.png');
    if (!existsSync(logoPath)) {
      console.warn(`[Marketing Images] Logo non trovato in "${logoPath}". Salto overlay.`);
      return imageBuffer;
    }

    const metadata = await sharp(imageBuffer).metadata();
    const bgWidth = metadata.width || 1024;
    const bgHeight = metadata.height || 1024;

    const logoTargetWidth = Math.round(bgWidth * 0.25);

    // Ridimensiona il logo e applica un'opacità del ~75% (alpha = 190) per un watermark elegante e trasparente
    const resizedLogoBuffer = await sharp(logoPath)
      .resize({ width: logoTargetWidth })
      .composite([{
        input: Buffer.from([0, 0, 0, 190]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in'
      }])
      .toBuffer();

    const logoMetadata = await sharp(resizedLogoBuffer).metadata();
    const logoWidth = logoMetadata.width || logoTargetWidth;
    const logoHeight = logoMetadata.height || Math.round(logoTargetWidth * (100 / 290));

    const paddingX = Math.round(bgWidth * 0.04);
    const paddingY = Math.round(bgHeight * 0.04);

    const left = bgWidth - logoWidth - paddingX;
    const top = bgHeight - logoHeight - paddingY;

    return await sharp(imageBuffer)
      .composite([{ input: resizedLogoBuffer, top, left }])
      .toBuffer();
  } catch (err) {
    console.error('[Marketing Images] Errore overlay logo:', err);
    return imageBuffer;
  }
}

const BLOB_PREFIX = 'marketing/campagne';
const DEFAULT_IMAGEN_MODEL = 'imagen-4.0-generate-001';

function getGeminiApiKey(): string {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new MarketingEngineConfigError(
      'GEMINI_API_KEY non configurata: impossibile generare l\'immagine.'
    );
  }
  return apiKey;
}

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new MarketingEngineConfigError(
      'BLOB_READ_WRITE_TOKEN mancante: impossibile caricare l\'immagine su Vercel Blob.'
    );
  }
  return token;
}

function aspectRatioForCampaign(campaign: {
  targetChannel: MarketingChannel;
  contentFormat: ContentFormat;
}): string {
  if (
    campaign.contentFormat === ContentFormat.STORY ||
    campaign.contentFormat === ContentFormat.REEL ||
    campaign.targetChannel === MarketingChannel.TIKTOK
  ) {
    return '9:16';
  }

  switch (campaign.targetChannel) {
    case MarketingChannel.META_INSTAGRAM:
      return '1:1';
    case MarketingChannel.META_FACEBOOK:
      return '4:3';
    case MarketingChannel.LINKEDIN:
      return '16:9';
    default:
      return '1:1';
  }
}

function buildFallbackImagePrompt(campaign: {
  category: string;
  targetChannel: MarketingChannel;
  copy: string;
}): string {
  const copyExcerpt = campaign.copy.replace(/\s+/g, ' ').trim().slice(0, 400);

  return [
    '[STYLE]: Quiet Luxury floreale sobrio per FloreMoria.',
    `[CATEGORY]: ${campaign.category}.`,
    `[CHANNEL]: ${campaign.targetChannel}.`,
    `[SUBJECT]: Composizione elegante ispirata al copy: ${copyExcerpt}.`,
    '[LIGHTING]: Luce naturale morbida, ora d\'oro o finestra nord.',
    '[PALETTE]: Avorio, salvia, cipria, terracotta desaturati.',
    '[AVOID]: Loghi, scritte, grafiche, colori neon, effetto stock photo.',
  ].join(' ');
}

async function generateImageBytes(
  prompt: string,
  aspectRatio: string
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const model =
    process.env.MARKETING_IMAGEN_MODEL?.trim() ||
    DEFAULT_IMAGEN_MODEL;
  const outputMimeType = 'image/png';
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

  let response;
  try {
    response = await ai.models.generateImages({
      model,
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio,
        outputMimeType,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Errore chiamata Imagen (${model}): ${msg}`);
  }

  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    throw new Error('Imagen non ha restituito byte immagine validi.');
  }

  return {
    buffer: Buffer.from(imageBytes, 'base64'),
    mimeType: outputMimeType,
    extension: 'png',
  };
}

/**
 * Genera l'immagine della campagna via Imagen (Gemini) e la carica su Vercel Blob (private).
 * Aggiorna `imageUrl` su Prisma e ritorna l'URL privato del blob.
 */
export async function generateAndStorageCampaignImage(
  campaignId: string,
  options?: { force?: boolean }
): Promise<string> {
  console.log(`[Marketing Images] Generazione immagine per campagna ${campaignId}`);

  const campaign = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new Error(`Campagna ${campaignId} non trovata.`);
  }

  const existingUrl = campaign.imageUrl?.trim();
  if (existingUrl && !options?.force) {
    console.log(`[Marketing Images] imageUrl già presente per ${campaignId}, skip.`);
    return existingUrl;
  }

  if (existingUrl && options?.force) {
    console.log(`[Marketing Images] force=true — rigenerazione immagine per ${campaignId}`);
  }

  const imagePrompt =
    campaign.imagePrompt?.trim() ||
    buildFallbackImagePrompt({
      category: campaign.category,
      targetChannel: campaign.targetChannel,
      copy: campaign.copy,
    });

  const aspectRatio = aspectRatioForCampaign({
    targetChannel: campaign.targetChannel,
    contentFormat: campaign.contentFormat,
  });
  const { buffer: originalBuffer, mimeType, extension } = await generateImageBytes(imagePrompt, aspectRatio);

  console.log(`[Marketing Images] Applicazione logo FloreMoria su immagine per campagna ${campaignId}`);
  const buffer = await overlayLogo(originalBuffer);

  const blobPath = `${BLOB_PREFIX}/${campaignId}.${extension}`;
  const { url } = await putBlobWithAccessFallback(blobPath, buffer, {
    contentType: mimeType,
    token: getBlobToken(),
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: { imageUrl: url },
  });

  console.log(`[Marketing Images] Upload completato: ${url}`);
  return url;
}
