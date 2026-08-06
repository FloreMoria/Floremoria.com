import { NextResponse } from 'next/server';
import { withProxiedCampaignMedia } from '@/lib/dashboard/campaignMediaUrl';
import prisma from '@/lib/prisma';
import { CampaignStatus, ContentFormat, MarketingChannel } from '@prisma/client';

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
  hasVideo: boolean,
  requested: ContentFormat
): ContentFormat {
  if (hasVideo) {
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

/**
 * POST { campaignId } — clona il contenuto sugli altri social organici
 * (stesso media/copy, canali ancora senza clone APPROVED/DRAFT recente).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const campaignId = String(body.campaignId || '').trim();
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId richiesto' }, { status: 400 });
    }

    const source = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
    if (!source) {
      return NextResponse.json({ success: false, error: 'Campagna non trovata' }, { status: 404 });
    }

    const hasVideo = Boolean(source.videoUrl?.trim());
    const existing = await prisma.marketingCampaign.findMany({
      where: {
        imageUrl: source.imageUrl,
        ...(source.videoUrl ? { videoUrl: source.videoUrl } : {}),
        copy: source.copy,
        status: { in: [CampaignStatus.APPROVED, CampaignStatus.DRAFT, CampaignStatus.PUBLISHED] },
      },
      select: { targetChannel: true },
    });
    const already = new Set(existing.map((e) => e.targetChannel));

    const created = [];
    for (const channel of SHARED_ORGANIC_CHANNELS) {
      if (already.has(channel)) continue;
      const row = await prisma.marketingCampaign.create({
        data: {
          status: CampaignStatus.APPROVED,
          category: source.category,
          targetChannel: channel,
          contentFormat: formatForChannel(channel, hasVideo, source.contentFormat),
          copy: source.copy,
          hashtags: source.hashtags,
          imageUrl: source.imageUrl,
          videoUrl: source.videoUrl,
        },
      });
      created.push(withProxiedCampaignMedia(row));
    }

    return NextResponse.json({
      success: true,
      createdCount: created.length,
      campaigns: created,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[campaigns/share-channels]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
