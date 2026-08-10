import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { publishCampaignToChannel } from '@/lib/postman/socialPublish';
import { CampaignStatus, MarketingChannel } from '@prisma/client';

function classifyPublishRouteError(err: unknown, channel?: string): {
  error: string;
  status: number;
  errorKind: string;
} {
  const message = err instanceof Error ? err.message : String(err || 'Unknown error');
  const lower = message.toLowerCase();
  const isTikTok = channel === MarketingChannel.TIKTOK || /tiktok/i.test(message);

  if (/timeout|aborted|aborterror/i.test(lower)) {
    return {
      status: 504,
      errorKind: 'timeout',
      error: isTikTok
        ? `Timeout durante la pubblicazione TikTok: ${message}. Verifica che l'URL del video B-roll sia HTTPS raggiungibile e che l'Access Token TikTok sia valido (Riautorizza se scaduto).`
        : `Timeout durante la pubblicazione: ${message}`,
    };
  }

  if (/fetch failed|econnreset|enotfound|eai_again|socket|network|failed to fetch|pre-flight video/i.test(lower)) {
    return {
      status: 502,
      errorKind: 'network',
      error: isTikTok
        ? `Errore di connessione TikTok: ${message}. Controlla raggiungibilità del video B-roll (HTTPS) e rinnovo Access Token.`
        : `Errore di connessione in pubblicazione: ${message}`,
    };
  }

  if (/access token|token scadut|token refresh|riautorizza tiktok|systemstate/i.test(lower)) {
    return {
      status: 401,
      errorKind: 'token',
      error: message,
    };
  }

  return {
    status: 500,
    errorKind: 'unknown',
    error: message,
  };
}

export async function POST(request: Request) {
  let targetChannel: string | undefined;
  try {
    const body = await request.json();
    const { campaignId, tiktokUx } = body;
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    targetChannel = campaign.targetChannel;
    console.log(
      `[Dashboard Publish] Manual force publish requested for campaign ${campaignId} to ${campaign.targetChannel}`
    );

    const result = await publishCampaignToChannel({
      id: campaign.id,
      targetChannel: campaign.targetChannel,
      contentFormat: campaign.contentFormat,
      copy: campaign.copy,
      hashtags: campaign.hashtags,
      imageUrl: campaign.imageUrl || '',
      videoUrl: campaign.videoUrl,
      tiktokUx,
    });

    if (result.success) {
      const existingMetrics =
        campaign.metricsJson && typeof campaign.metricsJson === 'object'
          ? (campaign.metricsJson as Record<string, unknown>)
          : {};

      await prisma.marketingCampaign.update({
        where: { id: campaignId },
        data: {
          status: CampaignStatus.PUBLISHED,
          publishedAt: new Date(),
          ...(result.contentFormat ? { contentFormat: result.contentFormat } : {}),
          ...(result.externalId && !result.simulated
            ? { externalId: String(result.externalId) }
            : {}),
          ...(result.videoUrl ? { videoUrl: result.videoUrl } : {}),
          ...(result.permalink && !result.simulated
            ? {
                metricsJson: {
                  ...existingMetrics,
                  permalink: result.permalink,
                },
                metricsSyncedAt: new Date(),
              }
            : {}),
        },
      });

      return NextResponse.json({
        success: true,
        simulated: result.simulated,
        externalId: result.externalId,
        permalink: result.permalink,
        contentFormat: result.contentFormat,
        privatePost: result.privatePost,
        videoUrl: result.videoUrl,
        videoSource: result.videoSource ?? null,
        usedPexelsFallback: Boolean(result.usedPexelsFallback),
        notice: result.notice ?? null,
      });
    }

    const failKind = /token|riautorizza/i.test(result.error || '')
      ? 'token'
      : /pre-flight|video|https|raggiungibil/i.test(result.error || '')
        ? 'media'
        : /timeout|connessione|rete|network|fetch/i.test(result.error || '')
          ? 'network'
          : 'publish';

    return NextResponse.json({
      success: false,
      error: result.error || 'Failed to publish to channel',
      errorKind: failKind,
      channel: campaign.targetChannel,
    });
  } catch (err) {
    const classified = classifyPublishRouteError(err, targetChannel);
    console.error('[Dashboard Publish] exception:', classified.errorKind, classified.error);
    return NextResponse.json(
      {
        success: false,
        error: classified.error,
        errorKind: classified.errorKind,
        channel: targetChannel || null,
      },
      { status: classified.status }
    );
  }
}
