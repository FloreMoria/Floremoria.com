import type { CampaignSocialMetrics } from '@/lib/marketing/socialMetrics/types';
import { emptyMetrics } from '@/lib/marketing/socialMetrics/types';
import { getValidPinterestAccessToken } from '@/src/agents/platforms/pinterestTokenService';
import { PINTEREST_API_BASE } from '@/lib/pinterest/oauth';

export type SimpleEnrichment = {
  campaignId: string;
  externalId: string;
  metrics: CampaignSocialMetrics;
};

/** LinkedIn: likes/comments su UGC se abbiamo externalId (URN). */
export async function enrichLinkedInCampaignMetrics(
  campaigns: Array<{ id: string; externalId: string | null }>
): Promise<SimpleEnrichment[]> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  if (!token) return [];

  const out: SimpleEnrichment[] = [];
  for (const c of campaigns) {
    if (!c.externalId || c.externalId.startsWith('simulated-')) {
      continue;
    }
    try {
      // socialActions su share/ugc
      const urn = encodeURIComponent(c.externalId);
      const res = await fetch(`https://api.linkedin.com/v2/socialActions/${urn}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'LinkedIn-Version': '202405',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        likesSummary?: { totalLikes?: number };
        commentsSummary?: { totalFirstLevelComments?: number };
        message?: string;
      };
      if (!res.ok) {
        out.push({
          campaignId: c.id,
          externalId: c.externalId,
          metrics: emptyMetrics({
            source: 'live',
            error: data.message || `LinkedIn HTTP ${res.status}`,
          }),
        });
        continue;
      }
      const likes = data.likesSummary?.totalLikes ?? null;
      const comments = data.commentsSummary?.totalFirstLevelComments ?? null;
      out.push({
        campaignId: c.id,
        externalId: c.externalId,
        metrics: emptyMetrics({
          likes,
          comments,
          engagement: (likes ?? 0) + (comments ?? 0) || null,
          source: 'live',
        }),
      });
    } catch (e) {
      out.push({
        campaignId: c.id,
        externalId: c.externalId!,
        metrics: emptyMetrics({
          source: 'live',
          error: e instanceof Error ? e.message : 'LinkedIn metrics error',
        }),
      });
    }
  }
  return out;
}

/** TikTok: query video list e match per id se presente. */
export async function enrichTikTokCampaignMetrics(
  campaigns: Array<{ id: string; externalId: string | null }>
): Promise<SimpleEnrichment[]> {
  const { getOrRefreshTikTokToken } = await import('@/lib/postman/tiktokToken');
  let accessToken: string | null = null;
  try {
    const tok = await getOrRefreshTikTokToken();
    accessToken = tok.accessToken || null;
  } catch {
    accessToken = process.env.TIKTOK_ACCESS_TOKEN?.trim() || null;
  }
  if (!accessToken) return [];

  const res = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,like_count,comment_count,share_count,view_count,share_url', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ max_count: 20 }),
    cache: 'no-store',
  });
  const payload = (await res.json().catch(() => ({}))) as {
    data?: { videos?: Array<{
      id?: string;
      title?: string;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
      view_count?: number;
      share_url?: string;
    }> };
    error?: { message?: string };
  };
  if (!res.ok) {
    return campaigns
      .filter((c) => c.externalId)
      .map((c) => ({
        campaignId: c.id,
        externalId: c.externalId!,
        metrics: emptyMetrics({
          source: 'live',
          error: payload.error?.message || `TikTok HTTP ${res.status}`,
        }),
      }));
  }

  const videos = payload.data?.videos || [];
  const out: SimpleEnrichment[] = [];
  for (const c of campaigns) {
    if (!c.externalId) continue;
    const video = videos.find((v) => v.id === c.externalId);
    if (!video) {
      out.push({
        campaignId: c.id,
        externalId: c.externalId,
        metrics: emptyMetrics({
          source: 'live',
          error: 'Video non trovato nella lista TikTok recente',
        }),
      });
      continue;
    }
    const likes = video.like_count ?? null;
    const comments = video.comment_count ?? null;
    const shares = video.share_count ?? null;
    const views = video.view_count ?? null;
    out.push({
      campaignId: c.id,
      externalId: c.externalId,
      metrics: emptyMetrics({
        views,
        likes,
        comments,
        shares,
        engagement: (likes ?? 0) + (comments ?? 0) + (shares ?? 0) || null,
        permalink: video.share_url ?? null,
        source: 'live',
      }),
    });
  }
  return out;
}

/** Pinterest pin analytics (lifetime). */
export async function enrichPinterestCampaignMetrics(
  campaigns: Array<{ id: string; externalId: string | null }>
): Promise<SimpleEnrichment[]> {
  const token = await getValidPinterestAccessToken();
  if (!token) return [];

  const out: SimpleEnrichment[] = [];
  const end = new Date();
  const start = new Date(end.getTime() - 1000 * 60 * 60 * 24 * 30);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  for (const c of campaigns) {
    if (!c.externalId || c.externalId.startsWith('simulated-')) continue;
    try {
      const url = `${PINTEREST_API_BASE}/pins/${encodeURIComponent(c.externalId)}/analytics?start_date=${startDate}&end_date=${endDate}&metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE,VIDEO_MRC_VIEW`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        message?: string;
        all?: { summary_metrics?: Record<string, number> };
      };
      if (!res.ok) {
        out.push({
          campaignId: c.id,
          externalId: c.externalId,
          metrics: emptyMetrics({
            source: 'live',
            error: data.message || `Pinterest HTTP ${res.status}`,
          }),
        });
        continue;
      }
      const summary = data.all?.summary_metrics || {};
      const impressions = summary.IMPRESSION ?? null;
      const clicks = summary.PIN_CLICK ?? summary.OUTBOUND_CLICK ?? null;
      const saves = summary.SAVE ?? null;
      const views = summary.VIDEO_MRC_VIEW ?? impressions;
      out.push({
        campaignId: c.id,
        externalId: c.externalId,
        metrics: emptyMetrics({
          impressions,
          views,
          clicks,
          saves,
          engagement: (clicks ?? 0) + (saves ?? 0) || null,
          source: 'live',
        }),
      });
    } catch (e) {
      out.push({
        campaignId: c.id,
        externalId: c.externalId!,
        metrics: emptyMetrics({
          source: 'live',
          error: e instanceof Error ? e.message : 'Pinterest metrics error',
        }),
      });
    }
  }
  return out;
}
