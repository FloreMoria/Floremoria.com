import type { MarketingChannel } from '@prisma/client';

/** Snapshot metriche normalizzate per la tabella Command Center. */
export type CampaignSocialMetrics = {
  views: number | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  engagement: number | null;
  permalink: string | null;
  source: 'live' | 'cached' | 'unavailable';
  error: string | null;
};

export type CampaignMetricsRow = {
  id: string;
  status: string;
  targetChannel: MarketingChannel;
  contentFormat: string;
  category: string;
  copy: string;
  imageUrl: string | null;
  videoUrl: string | null;
  externalId: string | null;
  publishedAt: string | null;
  updatedAt: string;
  metricsSyncedAt: string | null;
  metrics: CampaignSocialMetrics;
};

export type ChannelMetricsSummary = {
  posts: number;
  withLiveMetrics: number;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  engagement: number;
};

export function emptyMetrics(partial?: Partial<CampaignSocialMetrics>): CampaignSocialMetrics {
  return {
    views: null,
    reach: null,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    clicks: null,
    engagement: null,
    permalink: null,
    source: 'unavailable',
    error: null,
    ...partial,
  };
}

export function parseStoredMetrics(raw: unknown): CampaignSocialMetrics | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : v == null ? null : Number(v) || null;
  return emptyMetrics({
    views: num(m.views),
    reach: num(m.reach),
    impressions: num(m.impressions),
    likes: num(m.likes),
    comments: num(m.comments),
    shares: num(m.shares),
    saves: num(m.saves),
    clicks: num(m.clicks),
    engagement: num(m.engagement),
    permalink: typeof m.permalink === 'string' ? m.permalink : null,
    source: m.source === 'live' || m.source === 'cached' ? m.source : 'cached',
    error: typeof m.error === 'string' ? m.error : null,
  });
}

function hasAnyMetricNumber(m: CampaignSocialMetrics): boolean {
  return [m.views, m.reach, m.impressions, m.likes, m.comments, m.shares, m.saves, m.clicks, m.engagement]
    .some((v) => typeof v === 'number' && Number.isFinite(v));
}

export function summarizeMetrics(rows: CampaignMetricsRow[]): ChannelMetricsSummary {
  return rows.reduce<ChannelMetricsSummary>(
    (acc, row) => {
      acc.posts += 1;
      if ((row.metrics.source === 'live' || row.metrics.source === 'cached') && hasAnyMetricNumber(row.metrics)) {
        acc.withLiveMetrics += 1;
      }
      acc.views += row.metrics.views ?? 0;
      acc.reach += row.metrics.reach ?? 0;
      acc.likes += row.metrics.likes ?? 0;
      acc.comments += row.metrics.comments ?? 0;
      acc.engagement += row.metrics.engagement ?? 0;
      return acc;
    },
    { posts: 0, withLiveMetrics: 0, views: 0, reach: 0, likes: 0, comments: 0, engagement: 0 }
  );
}

export function normalizeCopySnippet(copy: string, len = 48): string {
  return copy.replace(/\s+/g, ' ').trim().slice(0, len).toLowerCase();
}

export function captionsLikelyMatch(campaignCopy: string, remoteCaption: string | null | undefined): boolean {
  const a = normalizeCopySnippet(campaignCopy, 40);
  const b = normalizeCopySnippet(remoteCaption || '', 40);
  if (!a || !b) return false;
  return a.includes(b.slice(0, 24)) || b.includes(a.slice(0, 24));
}
