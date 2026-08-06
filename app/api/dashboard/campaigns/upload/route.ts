import { NextResponse } from 'next/server';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { withProxiedCampaignMedia } from '@/lib/dashboard/campaignMediaUrl';
import { overlayFloreMoriaWatermark } from '@/lib/marketing/engine/watermark';
import prisma from '@/lib/prisma';
import { CampaignStatus, ContentFormat, MarketingChannel } from '@prisma/client';

/** Canali organici su cui clonare un upload manuale (no Google Ads). */
const SHARED_ORGANIC_CHANNELS: MarketingChannel[] = [
  MarketingChannel.META_INSTAGRAM,
  MarketingChannel.META_FACEBOOK,
  MarketingChannel.TIKTOK,
  MarketingChannel.YOUTUBE_SHORTS,
  MarketingChannel.PINTEREST,
  MarketingChannel.LINKEDIN,
];

function formatForChannel(
  channel: MarketingChannel,
  isVideo: boolean,
  requested: ContentFormat
): ContentFormat {
  if (isVideo) {
    // Video → Reel sui canali video; LinkedIn/Pinterest restano FEED se non supportano reel nativo come Meta.
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
  // Foto: Story solo se richiesto esplicitamente sul canale Meta; altrimenti Feed.
  if (
    requested === ContentFormat.STORY &&
    (channel === MarketingChannel.META_INSTAGRAM || channel === MarketingChannel.META_FACEBOOK)
  ) {
    return ContentFormat.STORY;
  }
  return ContentFormat.FEED_POST;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const channel = formData.get('channel') as string | null;
    const contentFormat = formData.get('contentFormat') as string | null;
    const copy = formData.get('copy') as string | null;
    const hashtagsStr = formData.get('hashtags') as string | null;
    const shareAllRaw = String(formData.get('shareAllChannels') || 'true').toLowerCase();
    const shareAllChannels = shareAllRaw !== 'false' && shareAllRaw !== '0';
    const categoryRaw = String(formData.get('category') || 'FT').toUpperCase().trim();
    const category =
      categoryRaw === 'FF' || categoryRaw === 'FT' || categoryRaw === 'FA' || categoryRaw === 'FP'
        ? categoryRaw
        : 'FT';

    if (!file || !channel || !contentFormat || !copy) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tutti i campi obbligatori (file, social, formato e copy) devono essere compilati.',
        },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type;
    const filename = file.name;
    const ext = filename.split('.').pop() || 'png';
    const isVideo = mimeType.startsWith('video/');
    const requestedFormat = contentFormat as ContentFormat;

    const buffer = isVideo ? rawBuffer : await overlayFloreMoriaWatermark(rawBuffer);

    const tempId = `manual-${Date.now()}`;
    const blobPrefix = 'marketing/campagne/manual';
    const blobPath = `${blobPrefix}/${tempId}.${ext}`;

    console.log(`[Upload API] Uploading manual file: ${filename} (${file.type}) to Vercel Blob`);
    const blobResult = await putBlobWithAccessFallback(blobPath, buffer, {
      contentType: mimeType,
      addRandomSuffix: true,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN?.trim(),
    });

    const hashtags = hashtagsStr
      ? hashtagsStr
          .split(',')
          .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
          .filter(Boolean)
      : [];

    const primaryChannel = channel as MarketingChannel;
    const targetChannels = shareAllChannels
      ? Array.from(new Set([primaryChannel, ...SHARED_ORGANIC_CHANNELS]))
      : [primaryChannel];

    const created = [];
    for (const targetChannel of targetChannels) {
      const resolvedFormat = formatForChannel(targetChannel, isVideo, requestedFormat);
      const row = await prisma.marketingCampaign.create({
        data: {
          status: CampaignStatus.APPROVED,
          category,
          targetChannel,
          contentFormat: resolvedFormat,
          copy: copy.trim(),
          hashtags,
          imageUrl: blobResult.url,
          videoUrl: isVideo ? blobResult.url : null,
        },
      });
      created.push(withProxiedCampaignMedia(row));
    }

    console.log(
      `[Upload API] Creati ${created.length} contenuti (shareAll=${shareAllChannels}) da ${filename}`
    );

    return NextResponse.json({
      success: true,
      campaign: created.find((c) => c.targetChannel === primaryChannel) || created[0],
      campaigns: created,
      sharedAcrossChannels: shareAllChannels,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Upload API] Error creating manual campaign:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
