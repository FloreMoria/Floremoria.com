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

function insightValue(data: Array<{ name?: string; values?: Array<{ value?: number }> }>, name: string): number | null {
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
  options?: { isStory?: boolean }
): Promise<CampaignSocialMetrics> {
  const tryMetrics = async (metricList: string) => {
    const payload = await metaGet<{ data?: Array<{ name?: string; values?: Array<{ value?: number }> }> }>(
      `/${mediaId}/insights?metric=${metricList}`,
      accessToken
    );
    return payload.data || [];
  };

  let data: Array<{ name?: string; values?: Array<{ value?: number }> }> = [];
  try {
    data = options?.isStory
      ? await tryMetrics('views,reach,replies,shares,total_interactions')
      : await tryMetrics('views,reach,saved,shares,total_interactions');
  } catch {
    try {
      data = options?.isStory
        ? await tryMetrics('views,reach,replies')
        : await tryMetrics('impressions,reach,engagement,saved');
    } catch {
      const likes = base.likes ?? 0;
      const comments = base.comments ?? 0;
      return emptyMetrics({
        ...base,
        engagement: likes + comments || null,
        source: 'live',
        error: null,
      });
    }
  }

  const views = insightValue(data, 'views') ?? insightValue(data, 'impressions');
  const reach = insightValue(data, 'reach');
  const saves = insightValue(data, 'saved');
  const shares = insightValue(data, 'shares');
  const replies = insightValue(data, 'replies');
  const engagement =
    insightValue(data, 'total_interactions') ??
    insightValue(data, 'engagement') ??
    (base.likes ?? 0) + (base.comments ?? replies ?? 0) + (saves ?? 0) + (shares ?? 0);

  return emptyMetrics({
    ...base,
    views,
    impressions: insightValue(data, 'impressions') ?? views,
    reach,
    comments: base.comments ?? replies,
    saves,
    shares,
    engagement: engagement || null,
    source: 'live',
    error: null,
  });
}

async function fetchFbPostInsights(
  postId: string,
  accessToken: string,
  base: Partial<CampaignSocialMetrics>
): Promise<CampaignSocialMetrics> {
  try {
    const payload = await metaGet<{ data?: Array<{ name?: string; values?: Array<{ value?: number }> }> }>(
      `/${postId}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks`,
      accessToken
    );
    const data = payload.data || [];
    const impressions = insightValue(data, 'post_impressions');
    const reach = insightValue(data, 'post_impressions_unique');
    const engagement = insightValue(data, 'post_engaged_users');
    const clicks = insightValue(data, 'post_clicks');
    return emptyMetrics({
      ...base,
      views: impressions,
      impressions,
      reach,
      clicks,
      engagement,
      source: 'live',
      error: null,
    });
  } catch {
    const likes = base.likes ?? 0;
    const comments = base.comments ?? 0;
    const shares = base.shares ?? 0;
    return emptyMetrics({
      ...base,
      engagement: likes + comments + shares || null,
      source: 'live',
      error: null,
    });
  }
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
    const metrics = await fetchIgMediaInsights(c.externalId, token, base, { isStory });
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
    const metrics = await fetchIgMediaInsights(remote.id, token, base);
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
