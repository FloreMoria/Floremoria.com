import { NextResponse } from 'next/server';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { withProxiedCampaignMedia } from '@/lib/dashboard/campaignMediaUrl';
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
      return NextResponse.json({ success: false, error: 'Tutti i campi obbligatori (file, social, formato e copy) devono essere compilati.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type;
    const filename = file.name;
    const ext = filename.split('.').pop() || 'png';

    // Genera un ID campagna temporaneo per il percorso del file
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

    const isVideo = mimeType.startsWith('video/');

    const hashtags = hashtagsStr
      ? hashtagsStr
          .split(',')
          .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
          .filter(Boolean)
      : [];

    const newCampaign = await prisma.marketingCampaign.create({
      data: {
        status: CampaignStatus.APPROVED, // Le campagne manuali saltano i Guardiani e sono subito APPROVATE
        category: 'FT', // Categoria standard
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
