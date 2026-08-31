import { ContentFormat, MarketingChannel } from '@prisma/client';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import prisma from '@/lib/prisma';
import {
  AI_IMAGE_NO_TEXT_DIRECTIVE,
  IMAGE_PROMPT_AVOID_BLOCK,
  enforceNoTextImagePrompt,
} from '@/lib/marketing/imagePromptGuard';
import { MarketingEngineConfigError } from './generation';
import {
  composeBrandedFeedLayout,
  shouldApplyBrandedFeedLayout,
} from './brandedLayoutOverlay';
import { generateGeminiImageBytes } from './geminiImageGeneration';
import { overlayFloreMoriaWatermark } from './watermark';

const BLOB_PREFIX = 'marketing/campagne';

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
  if (campaign.targetChannel === MarketingChannel.PINTEREST) {
    return '9:16';
  }

  if (
    campaign.contentFormat === ContentFormat.STORY ||
    campaign.contentFormat === ContentFormat.REEL ||
    campaign.targetChannel === MarketingChannel.TIKTOK ||
    campaign.targetChannel === MarketingChannel.YOUTUBE_SHORTS
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
}): string {
  return [
    '[STYLE]: Quiet Luxury floreale sobrio per FloreMoria.',
    `[CATEGORY]: ${campaign.category}.`,
    `[CHANNEL]: ${campaign.targetChannel}.`,
    '[SUBJECT]: Composizione floreale elegante — solo scena fotografica, mai testo nel frame.',
    '[LIGHTING]: Luce naturale morbida, ora d\'oro o finestra nord.',
    '[PALETTE]: Avorio, salvia, cipria, terracotta desaturati.',
    IMAGE_PROMPT_AVOID_BLOCK,
    AI_IMAGE_NO_TEXT_DIRECTIVE,
  ].join(' ');
}

/**
 * Genera l'immagine della campagna via Gemini Image e la carica su Vercel Blob.
 * Aggiorna `imageUrl` su Prisma e ritorna l'URL del blob.
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

  const imagePrompt = enforceNoTextImagePrompt(
    campaign.imagePrompt?.trim() ||
      buildFallbackImagePrompt({
        category: campaign.category,
        targetChannel: campaign.targetChannel,
      })
  );

  const aspectRatio = aspectRatioForCampaign({
    targetChannel: campaign.targetChannel,
    contentFormat: campaign.contentFormat,
  });
  const { buffer: originalBuffer, mimeType, extension } = await generateGeminiImageBytes(
    imagePrompt,
    aspectRatio
  );

  let buffer: Buffer;
  let outMime = mimeType;
  let outExt = extension;
  if (shouldApplyBrandedFeedLayout(campaign.targetChannel, campaign.contentFormat)) {
    console.log(
      `[Marketing Images] Layout brand deterministico (colonna beige + slogan) campagna ${campaignId}`
    );
    buffer = await composeBrandedFeedLayout({
      photoBuffer: originalBuffer,
      sloganSeed: campaign.id,
    });
    outMime = 'image/jpeg';
    outExt = 'jpg';
  } else {
    console.log(`[Marketing Images] Applicazione watermark FloreMoria su campagna ${campaignId}`);
    buffer = await overlayFloreMoriaWatermark(originalBuffer);
  }

  const blobPath = `${BLOB_PREFIX}/${campaignId}.${outExt}`;
  const { url } = await putBlobWithAccessFallback(blobPath, buffer, {
    contentType: outMime,
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
