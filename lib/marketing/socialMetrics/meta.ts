/**
 * Metriche Meta (Instagram + Facebook Page) via Graph API.
 * Per campagne senza externalId: match per caption sui media recenti dell’account.
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
  externalId: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type MetaMetricsEnrichment = {
  campaignId: string;
  externalId: string;
  metrics: CampaignSocialMetrics;
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
  base: Partial<CampaignSocialMetrics>
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
    data = await tryMetrics('views,reach,saved,shares,total_interactions');
  } catch {
    try {
      data = await tryMetrics('impressions,reach,engagement,saved');
    } catch (e) {
      const likes = base.likes ?? 0;
      const comments = base.comments ?? 0;
      return emptyMetrics({
        ...base,
        engagement: likes + comments || null,
        source: 'live',
        // Like/commenti restano utili anche senza permesso insights
        error: null,
      });
    }
  }

  const views = insightValue(data, 'views') ?? insightValue(data, 'impressions');
  const reach = insightValue(data, 'reach');
  const saves = insightValue(data, 'saved');
  const shares = insightValue(data, 'shares');
  const engagement =
    insightValue(data, 'total_interactions') ??
    insightValue(data, 'engagement') ??
    (base.likes ?? 0) + (base.comments ?? 0) + (saves ?? 0) + (shares ?? 0);

  return emptyMetrics({
    ...base,
    views,
    impressions: insightValue(data, 'impressions') ?? views,
    reach,
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
  } catch (e) {
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

export async function enrichInstagramCampaignMetrics(
  campaigns: MetaCampaignStub[]
): Promise<MetaMetricsEnrichment[]> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !igUserId) {
    return campaigns.map((c) => ({
      campaignId: c.id,
      externalId: c.externalId || '',
      metrics: emptyMetrics({ error: 'META_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID mancanti' }),
    })).filter((r) => r.externalId);
  }

  const list = await metaGet<{
    data?: Array<{
      id: string;
      caption?: string;
      timestamp?: string;
      like_count?: number;
      comments_count?: number;
      permalink?: string;
      media_url?: string;
      thumbnail_url?: string;
    }>;
  }>(
    `/${igUserId}/media?fields=id,caption,timestamp,like_count,comments_count,permalink,media_url,thumbnail_url&limit=100`,
    token
  );

  const remotes = list.data || [];
  const used = new Set<string>();
  const out: MetaMetricsEnrichment[] = [];

  // Prima: campagne già collegate
  for (const c of campaigns) {
    if (!c.externalId) continue;
    const remote = remotes.find((r) => r.id === c.externalId);
    const base = {
      likes: remote?.like_count ?? null,
      comments: remote?.comments_count ?? null,
      permalink: remote?.permalink ?? null,
    };
    const metrics = await fetchIgMediaInsights(c.externalId, token, base);
    used.add(c.id);
    out.push({ campaignId: c.id, externalId: c.externalId, metrics });
  }

  // Poi: match per caption sui rimanenti
  for (const remote of remotes) {
    const match = pickMatch(
      campaigns.filter((c) => !used.has(c.id)),
      { id: remote.id, caption: remote.caption, createdTime: remote.timestamp },
      used
    );
    if (!match) continue;
    used.add(match.id);
    const base = {
      likes: remote.like_count ?? null,
      comments: remote.comments_count ?? null,
      permalink: remote.permalink ?? null,
    };
    const metrics = await fetchIgMediaInsights(remote.id, token, base);
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

  // Token pagina (insights post richiedono page token)
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
    // Fallback: solo campagne con externalId già noto
    remotes = [];
  }

  const used = new Set<string>();
  const out: MetaMetricsEnrichment[] = [];

  for (const c of campaigns) {
    if (!c.externalId) continue;
    const remote = remotes.find((r) => r.id === c.externalId || r.id.endsWith(c.externalId!));
    const base = {
      likes: remote?.likes?.summary?.total_count ?? null,
      comments: remote?.comments?.summary?.total_count ?? null,
      shares: remote?.shares?.count ?? null,
      permalink: remote?.permalink_url ?? null,
    };
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
    const base = {
      likes: remote.likes?.summary?.total_count ?? null,
      comments: remote.comments?.summary?.total_count ?? null,
      shares: remote.shares?.count ?? null,
      permalink: remote.permalink_url ?? null,
    };
    const metrics = await fetchFbPostInsights(remote.id, pageToken, base);
    out.push({ campaignId: match.id, externalId: remote.id, metrics });
  }

  return out;
}
