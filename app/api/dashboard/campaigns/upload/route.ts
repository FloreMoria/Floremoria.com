import { NextResponse } from 'next/server';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { withProxiedCampaignMedia } from '@/lib/dashboard/campaignMediaUrl';
import { overlayFloreMoriaWatermark } from '@/lib/marketing/engine/watermark';
import prisma from '@/lib/prisma';
import { CampaignStatus, ContentFormat, MarketingChannel } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const channel = formData.get('channel') as string | null;
    const contentFormat = formData.get('contentFormat') as string | null;
    const copy = formData.get('copy') as string | null;
    const hashtagsStr = formData.get('hashtags') as string | null;

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

    // Immagini: watermark su ogni canale. Video raw: nessuna overlay frame-by-frame qui.
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

    const newCampaign = await prisma.marketingCampaign.create({
      data: {
        status: CampaignStatus.APPROVED,
        category: 'FT',
        targetChannel: channel as MarketingChannel,
        contentFormat: contentFormat as ContentFormat,
        copy: copy.trim(),
        hashtags,
        imageUrl: blobResult.url,
        videoUrl: isVideo ? blobResult.url : null,
      },
    });

    return NextResponse.json({
      success: true,
      campaign: withProxiedCampaignMedia(newCampaign),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Upload API] Error creating manual campaign:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
