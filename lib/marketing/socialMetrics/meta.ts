/**
 * Metriche Meta (Instagram + Facebook Page) via Graph API.
 * Feed/Reel: match per externalId o caption. Story attive: endpoint /stories + match temporale.
 */
import type { CampaignSocialMetrics } from '@/lib/marketing/socialMetrics/types';
import {
  captionsLikelyMatch,
  emptyMetrics,
} from '@/lib/marketing/socialMetrics/types';

const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

type MetaCampaignStub = {
  id: string;
  copy: string;
  contentFormat: string;
  externalId: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type MetaMetricsEnrichment = {
  campaignId: string;
  externalId: string;
  metrics: CampaignSocialMetrics;
};

type IgRemoteMedia = {
  id: string;
  caption?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  media_type?: string;
};

function insightValue(data: Array<{ name?: string; values?: Array<{ value?: unknown }> }>, name: string): number | null {
  const row = data.find((d) => d.name === name);
  const v = row?.values?.[0]?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function metaGet<T>(path: string, accessToken: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${META_GRAPH_BASE}${path}${sep}access_token=${encodeURIComponent(accessToken)}`, {
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message || `Meta Graph HTTP ${res.status}`);
  }
  return json;
}

async function fetchIgMediaInsights(
  mediaId: string,
  accessToken: string,
  base: Partial<CampaignSocialMetrics>,
  options?: { isStory?: boolean; mediaType?: string }
): Promise<CampaignSocialMetrics> {
  const dataMap = new Map<string, number>();

  const queryMetrics = async (metrics: string[]) => {
    try {
      const payload = await metaGet<{
        data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }>;
      }>(`/${mediaId}/insights?metric=${metrics.join(',')}`, accessToken);

      if (payload.data && Array.isArray(payload.data)) {
        for (const item of payload.data) {
          if (item.name && item.values?.[0]?.value != null) {
            const val = item.values[0].value;
            if (typeof val === 'number') {
              dataMap.set(item.name, val);
            }
          }
        }
      }
    } catch {
      // Fallback metrica per metrica se una combinazione fallisce su Graph API
      for (const m of metrics) {
        try {
          const single = await metaGet<{
            data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }>;
          }>(`/${mediaId}/insights?metric=${m}`, accessToken);
          const val = single.data?.[0]?.values?.[0]?.value;
          if (typeof val === 'number') {
            dataMap.set(m, val);
          }
        } catch {
          // Metrica non disponibile per questa specifica media_type
        }
      }
    }
  };

  const mediaType = (options?.mediaType || '').toUpperCase();

  if (options?.isStory) {
    await queryMetrics(['views', 'reach', 'replies', 'shares', 'total_interactions']);
  } else if (mediaType === 'VIDEO' || mediaType === 'REELS') {
    await queryMetrics(['plays', 'views', 'reach', 'saved', 'shares', 'total_interactions']);
  } else if (mediaType === 'IMAGE' || mediaType === 'CAROUSEL_ALBUM') {
    await queryMetrics(['impressions', 'reach', 'saved', 'shares', 'total_interactions']);
  } else {
    // Media type non specificato: proviamo prima le metriche standard, poi quelle video
    await queryMetrics(['impressions', 'reach', 'saved', 'shares', 'total_interactions']);
    if (!dataMap.has('impressions') && !dataMap.has('reach')) {
      await queryMetrics(['plays', 'views']);
    }
  }

  const views = dataMap.get('views') ?? dataMap.get('plays') ?? dataMap.get('impressions') ?? null;
  const impressions = dataMap.get('impressions') ?? views;
  const reach = dataMap.get('reach');
  const saves = dataMap.get('saved');
  const shares = dataMap.get('shares');
  const replies = dataMap.get('replies');

  const engagement =
    dataMap.get('total_interactions') ??
    dataMap.get('engagement') ??
    ((base.likes ?? 0) + (base.comments ?? replies ?? 0) + (saves ?? 0) + (shares ?? 0));

  return emptyMetrics({
    ...base,
    views: views ?? 0,
    impressions: impressions ?? 0,
    reach: reach ?? 0,
    comments: base.comments ?? replies ?? 0,
    saves: saves ?? 0,
    shares: shares ?? 0,
    likes: base.likes ?? 0,
    engagement: engagement ?? 0,
    source: 'live',
    error: null,
  });
}

async function fetchFbPostInsights(
  postId: string,
  accessToken: string,
  base: Partial<CampaignSocialMetrics>
): Promise<CampaignSocialMetrics> {
  const dataMap = new Map<string, number>();

  const queryMetrics = async (metrics: string[]) => {
    try {
      const payload = await metaGet<{
        data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }>;
      }>(`/${postId}/insights?metric=${metrics.join(',')}`, accessToken);

      if (payload.data && Array.isArray(payload.data)) {
        for (const item of payload.data) {
          if (item.name && item.values?.[0]?.value != null) {
            const val = item.values[0].value;
            if (typeof val === 'number') {
              dataMap.set(item.name, val);
            } else if (typeof val === 'object' && val !== null) {
              const total = Object.values(val as Record<string, number>).reduce(
                (acc, v) => acc + (typeof v === 'number' ? v : 0),
                0
              );
              dataMap.set(item.name, total);
            }
          }
        }
      }
    } catch {
      // Fallback metrica per metrica se una combinazione fallisce su Graph API
      for (const m of metrics) {
        try {
          const single = await metaGet<{
            data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }>;
          }>(`/${postId}/insights?metric=${m}`, accessToken);
          const val = single.data?.[0]?.values?.[0]?.value;
          if (typeof val === 'number') {
            dataMap.set(m, val);
          } else if (typeof val === 'object' && val !== null) {
            const total = Object.values(val as Record<string, number>).reduce(
              (acc, v) => acc + (typeof v === 'number' ? v : 0),
              0
            );
            dataMap.set(m, total);
          }
        } catch {
          // Metrica non supportata per questa tipologia di post FB
        }
      }
    }
  };

  await queryMetrics([
    'post_impressions',
    'post_impressions_unique',
    'post_engaged_users',
    'post_clicks',
    'post_reactions_by_type_total',
    'post_video_views',
    'blue_reels_play_count',
  ]);

  const impressions =
    dataMap.get('post_impressions') ??
    dataMap.get('post_video_views') ??
    dataMap.get('blue_reels_play_count') ??
    0;
  const reach = dataMap.get('post_impressions_unique') ?? 0;
  const engagement = dataMap.get('post_engaged_users') ?? 0;
  const clicks = dataMap.get('post_clicks') ?? 0;
  const totalReactions = dataMap.get('post_reactions_by_type_total') ?? 0;

  const likes = base.likes ?? totalReactions;

  return emptyMetrics({
    ...base,
    likes,
    comments: base.comments ?? 0,
    shares: base.shares ?? 0,
    views: impressions,
    impressions,
    reach,
    clicks,
    engagement: engagement || (likes + (base.comments ?? 0) + (base.shares ?? 0)),
    source: 'live',
    error: null,
  });
}

function pickMatch(
  campaigns: MetaCampaignStub[],
  remote: { id: string; caption?: string | null; createdTime?: string | null },
  usedCampaignIds: Set<string>
): MetaCampaignStub | null {
  const remoteTime = remote.createdTime ? new Date(remote.createdTime).getTime() : NaN;
  let best: { c: MetaCampaignStub; score: number } | null = null;

  for (const c of campaigns) {
    if (usedCampaignIds.has(c.id)) continue;
    if (c.externalId && c.externalId !== remote.id) continue;
    if (c.externalId === remote.id) return c;

    const copyMatch = captionsLikelyMatch(c.copy, remote.caption);
    const anchor = (c.publishedAt || c.updatedAt).getTime();
    const timeOk =
      !Number.isFinite(remoteTime) || Math.abs(remoteTime - anchor) < 1000 * 60 * 60 * 24 * 14;
    if (!copyMatch && !(c.externalId === remote.id)) continue;
    if (!timeOk && !copyMatch) continue;

    const score = (copyMatch ? 10 : 0) + (timeOk ? 3 : 0) + (c.externalId === remote.id ? 50 : 0);
    if (!best || score > best.score) best = { c, score };
  }
  return best && best.score >= 10 ? best.c : null;
}

/** Story IG non hanno caption: match per finestra temporale sulla campagna STORY più vicina. */
function pickStoryByTime(
  campaigns: MetaCampaignStub[],
  remoteTimestamp: string | undefined,
  usedCampaignIds: Set<string>
): MetaCampaignStub | null {
  if (!remoteTimestamp) return null;
  const remoteTime = new Date(remoteTimestamp).getTime();
  if (!Number.isFinite(remoteTime)) return null;

  const windowMs = 1000 * 60 * 60 * 6; // ±6h
  let best: { c: MetaCampaignStub; delta: number } | null = null;

  for (const c of campaigns) {
    if (usedCampaignIds.has(c.id)) continue;
    if (c.contentFormat !== 'STORY') continue;
    if (c.externalId) continue;
    const anchor = (c.publishedAt || c.updatedAt).getTime();
    const delta = Math.abs(remoteTime - anchor);
    if (delta > windowMs) continue;
    if (!best || delta < best.delta) best = { c, delta };
  }
  return best?.c ?? null;
}

function mediaThumb(remote: IgRemoteMedia): string | null {
  return remote.thumbnail_url || remote.media_url || null;
}

export async function enrichInstagramCampaignMetrics(
  campaigns: MetaCampaignStub[]
): Promise<MetaMetricsEnrichment[]> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !igUserId) {
    return campaigns
      .map((c) => ({
        campaignId: c.id,
        externalId: c.externalId || '',
        metrics: emptyMetrics({ error: 'META_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID mancanti' }),
      }))
      .filter((r) => r.externalId);
  }

  const list = await metaGet<{ data?: IgRemoteMedia[] }>(
    `/${igUserId}/media?fields=id,caption,timestamp,like_count,comments_count,permalink,media_url,thumbnail_url,media_type&limit=100`,
    token
  );

  let stories: IgRemoteMedia[] = [];
  try {
    const storyList = await metaGet<{ data?: IgRemoteMedia[] }>(
      `/${igUserId}/stories?fields=id,media_type,timestamp,permalink,media_url,thumbnail_url&limit=50`,
      token
    );
    stories = storyList.data || [];
  } catch (e) {
    console.warn('[socialMetrics:ig] stories list failed', e instanceof Error ? e.message : e);
  }

  const remotes = list.data || [];
  const used = new Set<string>();
  const out: MetaMetricsEnrichment[] = [];

  // Prima: campagne già collegate (feed/reel/story con ID)
  for (const c of campaigns) {
    if (!c.externalId) continue;
    const remote =
      remotes.find((r) => r.id === c.externalId) || stories.find((r) => r.id === c.externalId);
    const isStory = c.contentFormat === 'STORY';
    const base = {
      likes: remote?.like_count ?? null,
      comments: remote?.comments_count ?? null,
      permalink: remote?.permalink ?? null,
      thumbnailUrl: remote ? mediaThumb(remote) : null,
    };
    const metrics = await fetchIgMediaInsights(c.externalId, token, base, {
      isStory,
      mediaType: remote?.media_type,
    });
    used.add(c.id);
    out.push({ campaignId: c.id, externalId: c.externalId, metrics });
  }

  // Match caption su feed/reel
  for (const remote of remotes) {
    const match = pickMatch(
      campaigns.filter((c) => !used.has(c.id) && c.contentFormat !== 'STORY'),
      { id: remote.id, caption: remote.caption, createdTime: remote.timestamp },
      used
    );
    if (!match) continue;
    used.add(match.id);
    const base = {
      likes: remote.like_count ?? null,
      comments: remote.comments_count ?? null,
      permalink: remote.permalink ?? null,
      thumbnailUrl: mediaThumb(remote),
    };
    const metrics = await fetchIgMediaInsights(remote.id, token, base, {
      mediaType: remote.media_type,
    });
    out.push({ campaignId: match.id, externalId: remote.id, metrics });
  }

  // Story ancora attive (<24h): match temporale + insights
  const claimedStoryIds = new Set(out.map((e) => e.externalId));
  for (const remote of stories) {
    if (claimedStoryIds.has(remote.id)) continue;

    const alreadyLinked = campaigns.find((c) => c.externalId === remote.id && !used.has(c.id));
    const match =
      alreadyLinked ||
      pickStoryByTime(
        campaigns.filter((c) => !used.has(c.id)),
        remote.timestamp,
        used
      );
    if (!match) continue;
    used.add(match.id);
    claimedStoryIds.add(remote.id);
    const base = {
      likes: null,
      comments: null,
      permalink: remote.permalink ?? null,
      thumbnailUrl: mediaThumb(remote),
    };
    const metrics = await fetchIgMediaInsights(remote.id, token, base, { isStory: true });
    out.push({ campaignId: match.id, externalId: remote.id, metrics });
  }

  return out;
}

export async function enrichFacebookCampaignMetrics(
  campaigns: MetaCampaignStub[]
): Promise<MetaMetricsEnrichment[]> {
  const userToken = process.env.META_ACCESS_TOKEN?.trim();
  const pageId = process.env.FB_PAGE_ID?.trim();
  if (!userToken || !pageId) {
    return [];
  }

  let pageToken = userToken;
  try {
    const pageInfo = await metaGet<{ access_token?: string }>(
      `/${pageId}?fields=access_token`,
      userToken
    );
    pageToken = pageInfo.access_token || userToken;
  } catch (e) {
    console.warn('[socialMetrics:fb] page token fallback', e instanceof Error ? e.message : e);
  }

  let remotes: Array<{
    id: string;
    message?: string;
    created_time?: string;
    permalink_url?: string;
    full_picture?: string;
    shares?: { count?: number };
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
  }> = [];

  try {
    const list = await metaGet<{
      data?: typeof remotes;
    }>(
      `/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,shares,likes.summary(true),comments.summary(true)&limit=100`,
      pageToken
    );
    remotes = list.data || [];
  } catch (e) {
    console.warn('[socialMetrics:fb] posts list failed', e instanceof Error ? e.message : e);
    remotes = [];
  }

  const used = new Set<string>();
  const out: MetaMetricsEnrichment[] = [];

  const baseFromRemote = (remote?: (typeof remotes)[number]) => ({
    likes: remote?.likes?.summary?.total_count ?? null,
    comments: remote?.comments?.summary?.total_count ?? null,
    shares: remote?.shares?.count ?? null,
    permalink: remote?.permalink_url ?? null,
    thumbnailUrl: remote?.full_picture ?? null,
  });

  for (const c of campaigns) {
    if (!c.externalId) continue;
    const remote = remotes.find((r) => r.id === c.externalId || r.id.endsWith(c.externalId!));
    const base = baseFromRemote(remote);
    const metrics = await fetchFbPostInsights(c.externalId, pageToken, base);
    used.add(c.id);
    out.push({ campaignId: c.id, externalId: c.externalId, metrics });
  }

  for (const remote of remotes) {
    const match = pickMatch(
      campaigns.filter((c) => !used.has(c.id)),
      { id: remote.id, caption: remote.message, createdTime: remote.created_time },
      used
    );
    if (!match) continue;
    used.add(match.id);
    const base = baseFromRemote(remote);
    const metrics = await fetchFbPostInsights(remote.id, pageToken, base);
    out.push({ campaignId: match.id, externalId: remote.id, metrics });
  }

  return out;
}
