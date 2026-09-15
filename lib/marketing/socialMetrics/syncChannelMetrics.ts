import { CampaignStatus, ContentFormat, MarketingChannel, Prisma } from '@prisma/client';
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
  getSocialInsightsConnection,
  isSimulatedSocialId,
  zeroedUnavailableMetrics,
  type SocialInsightsConnection,
} from '@/lib/marketing/socialMetrics/connectionStatus';
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
 * Completa le campagne non toccate dalla sync piattaforme con zeri reali + messaggio,
 * così non restano in dashboard KPI vecchi/inventati.
 */
function fillMissingEnrichments(
  stubs: Array<{ id: string; externalId: string | null }>,
  enrichments: Array<{
    campaignId: string;
    externalId: string;
    metrics: ReturnType<typeof emptyMetrics>;
  }>
) {
  const enrichedIds = new Set(enrichments.map((e) => e.campaignId));
  for (const s of stubs) {
    if (enrichedIds.has(s.id)) continue;
    const error = isSimulatedSocialId(s.externalId)
      ? 'Pubblicazione simulata — insight non disponibili'
      : s.externalId
        ? 'Post non trovato nella sync piattaforme (metriche = 0)'
        : 'ID post non salvato — impossibile recuperare insight (metriche = 0)';
    enrichments.push({
      campaignId: s.id,
      externalId: s.externalId && !isSimulatedSocialId(s.externalId) ? s.externalId : '',
      metrics: emptyMetrics(zeroedUnavailableMetrics(error)),
    });
  }
}

/**
 * Sincronizza metriche live per un canale e restituisce righe tabella + summary.
 * Mai numeri inventati: o insight/API reali, o 0 con avviso.
 */
export async function syncAndListChannelMetrics(
  channel: MarketingChannel,
  options?: { refresh?: boolean; limit?: number }
): Promise<{
  rows: CampaignMetricsRow[];
  summary: ChannelMetricsSummary;
  refreshed: boolean;
  connection: SocialInsightsConnection;
  lastSyncedAt: string | null;
}> {
  const limit = options?.limit ?? 40;
  const refresh = options?.refresh !== false;
  const connection = getSocialInsightsConnection(channel);

  const campaigns = await prisma.marketingCampaign.findMany({
    where: {
      targetChannel: channel,
      status: CampaignStatus.PUBLISHED,
      contentFormat: { not: ContentFormat.STORY },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
  });

  if (refresh && campaigns.length > 0) {
    const stubs = campaigns.map((c) => ({
      id: c.id,
      copy: c.copy,
      contentFormat: c.contentFormat,
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
          enrichments = stubs.map((s) => ({
            campaignId: s.id,
            externalId: s.externalId && !isSimulatedSocialId(s.externalId) ? s.externalId : '',
            metrics: emptyMetrics(
              zeroedUnavailableMetrics(
                'YouTube Analytics non configurato (manca OAuth/API key).'
              )
            ),
          }));
          break;
        default:
          break;
      }

      fillMissingEnrichments(stubs, enrichments);

      if (enrichments.length > 0) {
        await persistEnrichments(enrichments);
      }
    } catch (err) {
      console.error('[socialMetrics] sync failed', channel, err);
      // In caso di errore hard: azzera con messaggio (niente KPI fantasma)
      await persistEnrichments(
        campaigns.map((c) => ({
          campaignId: c.id,
          externalId: c.externalId && !isSimulatedSocialId(c.externalId) ? c.externalId : '',
          metrics: emptyMetrics(
            zeroedUnavailableMetrics(
              err instanceof Error ? err.message : 'Sync insight fallita'
            )
          ),
        }))
      );
    }
  }

  const fresh = await prisma.marketingCampaign.findMany({
    where: {
      targetChannel: channel,
      status: CampaignStatus.PUBLISHED,
      contentFormat: { not: ContentFormat.STORY },
    },
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  });

  const rows: CampaignMetricsRow[] = fresh.map((c) => {
    const stored = parseStoredMetrics(c.metricsJson);
    const missingIdHint =
      'ID post social non salvato — ripubblica o attendi sync Meta (metriche = 0)';
    const metrics =
      stored ||
      emptyMetrics(
        zeroedUnavailableMetrics(
          c.externalId ? 'Metriche non ancora sincronizzate (premi Aggiorna Metriche)' : missingIdHint
        )
      );

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

  const lastSyncedAt =
    rows
      .map((r) => r.metricsSyncedAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;

  return {
    rows,
    summary: summarizeMetrics(rows),
    refreshed: refresh,
    connection,
    lastSyncedAt,
  };
}
