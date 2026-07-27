import { CampaignStatus, MarketingChannel, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  enrichFacebookCampaignMetrics,
  enrichInstagramCampaignMetrics,
} from '@/lib/marketing/socialMetrics/meta';
import {
  enrichLinkedInCampaignMetrics,
  enrichPinterestCampaignMetrics,
  enrichTikTokCampaignMetrics,
} from '@/lib/marketing/socialMetrics/otherChannels';
import {
  emptyMetrics,
  parseStoredMetrics,
  summarizeMetrics,
  type CampaignMetricsRow,
  type ChannelMetricsSummary,
} from '@/lib/marketing/socialMetrics/types';
import { toCampaignMediaProxyUrl } from '@/lib/dashboard/campaignMediaUrl';

function asMetricsJson(metrics: ReturnType<typeof emptyMetrics>): Prisma.InputJsonValue {
  return metrics as unknown as Prisma.InputJsonValue;
}

async function persistEnrichments(
  enrichments: Array<{
    campaignId: string;
    externalId: string;
    metrics: ReturnType<typeof emptyMetrics>;
  }>
): Promise<void> {
  const now = new Date();
  for (const e of enrichments) {
    const current = await prisma.marketingCampaign.findUnique({
      where: { id: e.campaignId },
      select: { publishedAt: true, updatedAt: true, status: true },
    });
    if (!current) continue;
    await prisma.marketingCampaign.update({
      where: { id: e.campaignId },
      data: {
        ...(e.externalId ? { externalId: e.externalId } : {}),
        metricsJson: asMetricsJson(e.metrics),
        metricsSyncedAt: now,
        ...(current.publishedAt || current.status !== CampaignStatus.PUBLISHED
          ? {}
          : { publishedAt: current.updatedAt }),
      },
    });
  }
}

/**
 * Sincronizza metriche live per un canale e restituisce righe tabella + summary.
 */
export async function syncAndListChannelMetrics(
  channel: MarketingChannel,
  options?: { refresh?: boolean; limit?: number }
): Promise<{ rows: CampaignMetricsRow[]; summary: ChannelMetricsSummary; refreshed: boolean }> {
  const limit = options?.limit ?? 40;
  const refresh = options?.refresh !== false;

  const campaigns = await prisma.marketingCampaign.findMany({
    where: {
      targetChannel: channel,
      status: CampaignStatus.PUBLISHED,
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
  });

  if (refresh && campaigns.length > 0) {
    const stubs = campaigns.map((c) => ({
      id: c.id,
      copy: c.copy,
      externalId: c.externalId,
      updatedAt: c.updatedAt,
      publishedAt: c.publishedAt,
    }));

    try {
      let enrichments: Array<{
        campaignId: string;
        externalId: string;
        metrics: ReturnType<typeof emptyMetrics>;
      }> = [];

      switch (channel) {
        case MarketingChannel.META_INSTAGRAM:
          enrichments = await enrichInstagramCampaignMetrics(stubs);
          break;
        case MarketingChannel.META_FACEBOOK:
          enrichments = await enrichFacebookCampaignMetrics(stubs);
          break;
        case MarketingChannel.LINKEDIN:
          enrichments = await enrichLinkedInCampaignMetrics(stubs);
          break;
        case MarketingChannel.TIKTOK:
          enrichments = await enrichTikTokCampaignMetrics(stubs);
          break;
        case MarketingChannel.PINTEREST:
          enrichments = await enrichPinterestCampaignMetrics(stubs);
          break;
        case MarketingChannel.YOUTUBE_SHORTS:
          // YouTube richiede videoId salvato + API key/OAuth — ancora non collegato in env.
          enrichments = stubs
            .filter((s) => s.externalId)
            .map((s) => ({
              campaignId: s.id,
              externalId: s.externalId!,
              metrics: emptyMetrics({
                source: 'unavailable',
                error: 'YouTube Analytics non configurato (manca OAuth/API key).',
              }),
            }));
          break;
        default:
          break;
      }

      if (enrichments.length > 0) {
        await persistEnrichments(enrichments);
      }
    } catch (err) {
      console.error('[socialMetrics] sync failed', channel, err);
    }
  }

  const fresh = await prisma.marketingCampaign.findMany({
    where: {
      targetChannel: channel,
      status: CampaignStatus.PUBLISHED,
    },
    orderBy: [{ metricsSyncedAt: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  });

  const rows: CampaignMetricsRow[] = fresh.map((c) => {
    const stored = parseStoredMetrics(c.metricsJson);
    const metrics =
      stored ||
      emptyMetrics({
        error: c.externalId
          ? 'Metriche non ancora sincronizzate'
          : 'ID post social non salvato — ripubblica o attendi sync Meta per match automatico',
      });

    return {
      id: c.id,
      status: c.status,
      targetChannel: c.targetChannel,
      contentFormat: c.contentFormat,
      category: c.category,
      copy: c.copy,
      imageUrl: toCampaignMediaProxyUrl(c.imageUrl) || c.imageUrl,
      videoUrl: toCampaignMediaProxyUrl(c.videoUrl) || c.videoUrl,
      externalId: c.externalId,
      publishedAt: (c.publishedAt || c.updatedAt).toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      metricsSyncedAt: c.metricsSyncedAt?.toISOString() ?? null,
      metrics,
    };
  });

  return {
    rows,
    summary: summarizeMetrics(rows),
    refreshed: refresh,
  };
}
