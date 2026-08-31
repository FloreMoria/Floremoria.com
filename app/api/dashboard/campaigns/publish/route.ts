import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { publishCampaignToChannel } from '@/lib/postman/socialPublish';
import { CampaignStatus, MarketingChannel } from '@prisma/client';

export const runtime = 'nodejs';
/** TikTok PULL_FROM_URL + preflight media: lascia margine al gateway. */
export const maxDuration = 60;

function classifyPublishRouteError(err: unknown, channel?: string): {
  error: string;
  status: number;
  errorKind: string;
} {
  const message = err instanceof Error ? err.message : String(err || 'Unknown error');
  const lower = message.toLowerCase();

  const channelLabel =
    channel === MarketingChannel.META_FACEBOOK
      ? 'Facebook'
      : channel === MarketingChannel.META_INSTAGRAM
        ? 'Instagram'
        : channel === MarketingChannel.TIKTOK
          ? 'TikTok'
          : channel === MarketingChannel.LINKEDIN
            ? 'LinkedIn'
            : channel === MarketingChannel.PINTEREST
              ? 'Pinterest'
              : channel === MarketingChannel.YOUTUBE_SHORTS
                ? 'YouTube Shorts'
                : 'social';

  if (/timeout|aborted|aborterror/i.test(lower)) {
    let specificError = `Timeout durante la pubblicazione su ${channelLabel}: ${message}`;
    if (channel === MarketingChannel.TIKTOK) {
      specificError = `Timeout durante la pubblicazione TikTok: ${message}. Verifica che l'URL del video sia HTTPS raggiungibile e che l'Access Token TikTok sia valido (Riautorizza se scaduto).`;
    } else if (channel === MarketingChannel.META_FACEBOOK) {
      specificError = `Timeout durante la pubblicazione Facebook: ${message}. Verifica che il video su Vercel Blob sia raggiungibile e che FACEBOOK_PAGE_ACCESS_TOKEN sia valido.`;
    } else if (channel === MarketingChannel.META_INSTAGRAM) {
      specificError = `Timeout durante la pubblicazione Instagram: ${message}. Verifica la raggiungibilità del media e che META_ACCESS_TOKEN sia valido.`;
    } else if (channel === MarketingChannel.LINKEDIN) {
      specificError = `Timeout durante la pubblicazione LinkedIn: ${message}. Verifica LINKEDIN_ACCESS_TOKEN e la connessione di rete.`;
    }
    return {
      status: 504,
      errorKind: 'timeout',
      error: specificError,
    };
  }

  if (/fetch failed|econnreset|enotfound|eai_again|socket|network|failed to fetch|pre-flight video/i.test(lower)) {
    let specificError = `Errore di connessione durante la pubblicazione su ${channelLabel}: ${message}`;
    if (channel === MarketingChannel.TIKTOK) {
      specificError = `Errore di connessione TikTok: ${message}. Controlla raggiungibilità del video (HTTPS) e rinnovo Access Token TikTok.`;
    } else if (channel === MarketingChannel.META_FACEBOOK) {
      specificError = `Errore di connessione Facebook: ${message}. Verifica la connessione a Meta Graph API e le credenziali della pagina.`;
    } else if (channel === MarketingChannel.META_INSTAGRAM) {
      specificError = `Errore di connessione Instagram: ${message}. Verifica la connessione a Meta Graph API.`;
    }
    return {
      status: 502,
      errorKind: 'network',
      error: specificError,
    };
  }

  if (/access token|token scadut|token refresh|riautorizza|systemstate/i.test(lower)) {
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
    const rawText = await request.text();
    let body: Record<string, unknown>;
    try {
      body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      console.error('[Dashboard Publish] Body non-JSON:', rawText.slice(0, 200));
      return NextResponse.json(
        {
          success: false,
          error:
            'Body della richiesta non valido (atteso JSON piccolo con campaignId). Non inviare il file video nel body.',
          errorKind: 'bad_request',
        },
        { status: 400 }
      );
    }
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : '';
    const tiktokUx = body.tiktokUx;
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
      tiktokUx: tiktokUx as import('@/lib/postman/tiktokCreatorInfo').TikTokPublishUxOptions | undefined,
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
                  ...(result.processing
                    ? {
                        publishPhase: result.publishPhase || 'IN_PUBBLICAZIONE',
                        metaProcessing: true,
                      }
                    : {}),
                },
                metricsSyncedAt: new Date(),
              }
            : result.processing
              ? {
                  metricsJson: {
                    ...existingMetrics,
                    publishPhase: result.publishPhase || 'IN_PUBBLICAZIONE',
                    metaProcessing: true,
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
        processing: Boolean(result.processing),
        publishPhase: result.publishPhase ?? null,
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
