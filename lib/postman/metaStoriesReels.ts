/**
 * Meta Graph API — Instagram/Facebook Stories e Reels.
 */
import { ContentFormat } from '@prisma/client';
import { ensureMetaFetchableImageUrl } from '@/lib/postman/socialImageStaging';
import { captionForFormat } from '@/lib/postman/socialStoryCopy';

const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type MetaEnv = {
  metaAccessToken?: string;
  fbPageId?: string;
  igBusinessAccountId?: string;
  blobToken?: string;
};

async function metaGraphPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, string>
): Promise<T> {
  const params = new URLSearchParams({ ...body, access_token: accessToken });
  const res = await fetch(`${META_GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const payload = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message || `Meta Graph API error (${res.status})`);
  }
  return payload;
}

async function getFacebookPageAccessToken(
  fbPageId: string,
  userAccessToken: string
): Promise<string> {
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${fbPageId}?fields=access_token&access_token=${userAccessToken}`
    );
    const payload = (await res.json()) as { access_token?: string; error?: { message?: string } };
    if (!res.ok || payload.error || !payload.access_token) {
      return userAccessToken;
    }
    return payload.access_token;
  } catch {
    return userAccessToken;
  }
}

export async function publishToInstagramStory(
  campaign: {
    id: string;
    copy: string;
    hashtags: string[];
    imageUrl: string;
    contentFormat: ContentFormat;
  },
  env: MetaEnv
): Promise<string> {
  const { metaAccessToken, igBusinessAccountId, blobToken } = env;
  if (!metaAccessToken || !igBusinessAccountId) {
    throw new Error('META_ACCESS_TOKEN o IG_BUSINESS_ACCOUNT_ID assenti');
  }

  const imageUrl = await ensureMetaFetchableImageUrl(campaign.id, campaign.imageUrl, blobToken);

  const container = await metaGraphPost<{ id?: string }>(
    `/${igBusinessAccountId}/media`,
    metaAccessToken,
    {
      media_type: 'STORIES',
      image_url: imageUrl,
    }
  );

  if (!container.id) {
    throw new Error('Meta Instagram Story: creation_id mancante.');
  }

  const published = await metaGraphPost<{ id?: string }>(
    `/${igBusinessAccountId}/media_publish`,
    metaAccessToken,
    { creation_id: container.id }
  );

  if (!published.id) {
    throw new Error('Meta Instagram Story: media id mancante.');
  }

  console.log(`[POSTMAN] Instagram Story pubblicata — ${published.id}`);
  return published.id;
}

export async function publishToInstagramReel(
  campaign: {
    id: string;
    copy: string;
    hashtags: string[];
    videoUrl: string;
    contentFormat: ContentFormat;
  },
  env: MetaEnv
): Promise<string> {
  const { metaAccessToken, igBusinessAccountId } = env;
  if (!metaAccessToken || !igBusinessAccountId) {
    throw new Error('META_ACCESS_TOKEN o IG_BUSINESS_ACCOUNT_ID assenti');
  }

  const caption = captionForFormat(campaign.contentFormat, campaign.copy, campaign.hashtags);

  const container = await metaGraphPost<{ id?: string }>(
    `/${igBusinessAccountId}/media`,
    metaAccessToken,
    {
      media_type: 'REELS',
      video_url: campaign.videoUrl,
      caption,
      share_to_feed: 'true',
    }
  );

  if (!container.id) {
    throw new Error('Meta Instagram Reel: creation_id mancante.');
  }

  const published = await metaGraphPost<{ id?: string }>(
    `/${igBusinessAccountId}/media_publish`,
    metaAccessToken,
    { creation_id: container.id }
  );

  if (!published.id) {
    throw new Error('Meta Instagram Reel: media id mancante.');
  }

  console.log(`[POSTMAN] Instagram Reel pubblicato — ${published.id}`);
  return published.id;
}

export async function publishToFacebookStory(
  campaign: {
    id: string;
    imageUrl: string;
  },
  env: MetaEnv
): Promise<string> {
  const { metaAccessToken, fbPageId, blobToken } = env;
  if (!metaAccessToken || !fbPageId) {
    throw new Error('META_ACCESS_TOKEN o FB_PAGE_ID assenti');
  }

  const pageToken = await getFacebookPageAccessToken(fbPageId, metaAccessToken);
  const photoUrl = await ensureMetaFetchableImageUrl(campaign.id, campaign.imageUrl, blobToken);

  const photo = await metaGraphPost<{ id?: string }>(`/${fbPageId}/photos`, pageToken, {
    url: photoUrl,
    published: 'false',
  });

  if (!photo.id) {
    throw new Error('Meta Facebook Story: photo id mancante.');
  }

  const story = await metaGraphPost<{ success?: boolean; post_id?: string }>(
    `/${fbPageId}/photo_stories`,
    pageToken,
    { photo_id: photo.id }
  );

  const externalId = story.post_id || photo.id;
  console.log(`[POSTMAN] Facebook Story pubblicata — ${externalId}`);
  return externalId;
}

export async function publishToFacebookReel(
  campaign: {
    id: string;
    copy: string;
    hashtags: string[];
    videoUrl: string;
    contentFormat: ContentFormat;
  },
  env: MetaEnv
): Promise<string> {
  const { metaAccessToken, fbPageId } = env;
  if (!metaAccessToken || !fbPageId) {
    throw new Error('META_ACCESS_TOKEN o FB_PAGE_ID assenti');
  }

  const pageToken = await getFacebookPageAccessToken(fbPageId, metaAccessToken);
  const caption = captionForFormat(campaign.contentFormat, campaign.copy, campaign.hashtags);

  const container = await metaGraphPost<{ id?: string }>(`/${fbPageId}/video_reels`, pageToken, {
    upload_phase: 'start',
  });

  // Facebook Reels richiede upload resumable — semplificato con video_url se supportato dalla pagina
  const reel = await metaGraphPost<{ id?: string }>(`/${fbPageId}/video_reels`, pageToken, {
    video_url: campaign.videoUrl,
    description: caption,
    published: 'true',
  });

  if (!reel.id) {
    throw new Error('Meta Facebook Reel: id mancante.');
  }

  console.log(`[POSTMAN] Facebook Reel pubblicato — ${reel.id}`);
  return reel.id;
}
