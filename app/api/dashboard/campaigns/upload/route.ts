import { NextResponse } from 'next/server';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { withProxiedCampaignMedia } from '@/lib/dashboard/campaignMediaUrl';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { overlayFloreMoriaWatermark } from '@/lib/marketing/engine/watermark';
import prisma from '@/lib/prisma';
import { CampaignStatus, ContentFormat, MarketingChannel } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Canali organici su cui clonare un upload manuale (no Google Ads). */
const SHARED_ORGANIC_CHANNELS: MarketingChannel[] = [
  MarketingChannel.META_INSTAGRAM,
  MarketingChannel.META_FACEBOOK,
  MarketingChannel.TIKTOK,
  MarketingChannel.YOUTUBE_SHORTS,
  MarketingChannel.PINTEREST,
  MarketingChannel.LINKEDIN,
];

/** Soglia sotto il limite tipico Vercel (~4.5MB) per FormData server-side. */
const MAX_INLINE_UPLOAD_BYTES = 4 * 1024 * 1024;

function formatForChannel(
  channel: MarketingChannel,
  isVideo: boolean,
  requested: ContentFormat
): ContentFormat {
  if (isVideo) {
    if (
      channel === MarketingChannel.META_INSTAGRAM ||
      channel === MarketingChannel.META_FACEBOOK ||
      channel === MarketingChannel.TIKTOK ||
      channel === MarketingChannel.YOUTUBE_SHORTS
    ) {
      return ContentFormat.REEL;
    }
    return ContentFormat.FEED_POST;
  }
  if (
    requested === ContentFormat.STORY &&
    (channel === MarketingChannel.META_INSTAGRAM || channel === MarketingChannel.META_FACEBOOK)
  ) {
    return ContentFormat.STORY;
  }
  return ContentFormat.FEED_POST;
}

function parseHashtags(hashtagsStr: string | null | undefined): string[] {
  if (!hashtagsStr) return [];
  return hashtagsStr
    .split(',')
    .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
    .filter(Boolean);
}

function parseCategory(raw: string | null | undefined): string {
  const categoryRaw = String(raw || 'FT').toUpperCase().trim();
  return categoryRaw === 'FF' || categoryRaw === 'FT' || categoryRaw === 'FA' || categoryRaw === 'FP'
    ? categoryRaw
    : 'FT';
}

async function createCampaignsFromMedia(params: {
  mediaUrl: string;
  isVideo: boolean;
  channel: string;
  contentFormat: string;
  copy: string;
  hashtags: string[];
  category: string;
  shareAllChannels: boolean;
  filename?: string;
}) {
  const primaryChannel = params.channel as MarketingChannel;
  const requestedFormat = params.contentFormat as ContentFormat;
  const targetChannels = params.shareAllChannels
    ? Array.from(new Set([primaryChannel, ...SHARED_ORGANIC_CHANNELS]))
    : [primaryChannel];

  const created = [];
  for (const targetChannel of targetChannels) {
    const resolvedFormat = formatForChannel(targetChannel, params.isVideo, requestedFormat);
    const row = await prisma.marketingCampaign.create({
      data: {
        status: CampaignStatus.APPROVED,
        category: params.category,
        targetChannel,
        contentFormat: resolvedFormat,
        copy: params.copy.trim(),
        hashtags: params.hashtags,
        imageUrl: params.mediaUrl,
        videoUrl: params.isVideo ? params.mediaUrl : null,
      },
    });
    created.push(withProxiedCampaignMedia(row));
  }

  console.log(
    `[Upload API] Creati ${created.length} contenuti (shareAll=${params.shareAllChannels})` +
      (params.filename ? ` da ${params.filename}` : ` da URL`)
  );

  return {
    success: true as const,
    campaign: created.find((c) => c.targetChannel === primaryChannel) || created[0],
    campaigns: created,
    sharedAcrossChannels: params.shareAllChannels,
  };
}

/**
 * Crea campagne da media già su Blob (video TikTok/Reel via client upload) oppure
 * da FormData inline per file piccoli (< ~4MB).
 */
export async function POST(request: Request) {
  const auth = await requireDashboardAdmin();
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get('content-type') || '';

    // Path preferito video: solo URL HTTPS (nessun binario nel body → no 413).
    if (contentType.includes('application/json')) {
      const rawText = await request.text();
      let body: Record<string, unknown>;
      try {
        body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        console.error('[Upload API] JSON body non valido:', rawText.slice(0, 200));
        return NextResponse.json(
          { success: false, error: 'Body JSON non valido.' },
          { status: 400 }
        );
      }

      const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
      const channel = typeof body.channel === 'string' ? body.channel : null;
      const contentFormat = typeof body.contentFormat === 'string' ? body.contentFormat : null;
      const copy = typeof body.copy === 'string' ? body.copy : null;
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
      const filename = typeof body.filename === 'string' ? body.filename : undefined;
      const shareAllRaw = String(body.shareAllChannels ?? true).toLowerCase();
      const shareAllChannels = shareAllRaw !== 'false' && shareAllRaw !== '0';
      const isVideo =
        Boolean(body.isVideo) ||
        mimeType.startsWith('video/') ||
        /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl);

      if (!mediaUrl || !channel || !contentFormat || !copy) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Campi obbligatori mancanti (mediaUrl, social, formato, copy). Per video TikTok carica prima su Blob.',
          },
          { status: 400 }
        );
      }

      if (!/^https:\/\//i.test(mediaUrl)) {
        return NextResponse.json(
          { success: false, error: 'mediaUrl deve essere un URL HTTPS pubblico (Blob / staging).' },
          { status: 400 }
        );
      }

      const result = await createCampaignsFromMedia({
        mediaUrl,
        isVideo,
        channel,
        contentFormat,
        copy,
        hashtags: parseHashtags(typeof body.hashtags === 'string' ? body.hashtags : null),
        category: parseCategory(typeof body.category === 'string' ? body.category : null),
        shareAllChannels,
        filename,
      });
      return NextResponse.json(result);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const channel = formData.get('channel') as string | null;
    const contentFormat = formData.get('contentFormat') as string | null;
    const copy = formData.get('copy') as string | null;
    const hashtagsStr = formData.get('hashtags') as string | null;
    const shareAllRaw = String(formData.get('shareAllChannels') || 'true').toLowerCase();
    const shareAllChannels = shareAllRaw !== 'false' && shareAllRaw !== '0';
    const category = parseCategory(String(formData.get('category') || 'FT'));

    if (!file || !channel || !contentFormat || !copy) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tutti i campi obbligatori (file, social, formato e copy) devono essere compilati.',
        },
        { status: 400 }
      );
    }

    const mimeType = file.type;
    const filename = file.name;
    const isVideo = mimeType.startsWith('video/');

    // Video (e file grandi) non devono passare da FormData: 413 → "Request Entity Too Large".
    if (isVideo || file.size > MAX_INLINE_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Video o file troppo grande per upload FormData (limite serverless). ' +
            'Il client deve caricare su Blob (multipart) e inviare solo mediaUrl HTTPS.',
          errorKind: 'payload_too_large',
          useClientBlobUpload: true,
        },
        { status: 413 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const ext = filename.split('.').pop() || 'png';
    const buffer = isVideo ? rawBuffer : await overlayFloreMoriaWatermark(rawBuffer);

    const tempId = `manual-${Date.now()}`;
    const blobPath = `marketing/campagne/manual/${tempId}.${ext}`;

    console.log(`[Upload API] Uploading manual file: ${filename} (${file.type}) to Vercel Blob`);
    const blobResult = await putBlobWithAccessFallback(blobPath, buffer, {
      contentType: mimeType,
      addRandomSuffix: true,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN?.trim(),
    });

    const result = await createCampaignsFromMedia({
      mediaUrl: blobResult.url,
      isVideo,
      channel,
      contentFormat,
      copy,
      hashtags: parseHashtags(hashtagsStr),
      category,
      shareAllChannels,
      filename,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Upload API] Error creating manual campaign:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
