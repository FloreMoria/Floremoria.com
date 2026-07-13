/**
 * Meta Graph API — Instagram/Facebook Stories e Reels.
 */
import { ContentFormat } from '@prisma/client';
import { ensureMetaFetchableImageUrl, ensureSocialFetchableVideoUrl } from '@/lib/postman/socialImageStaging';
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

/**
 * Instagram richiede status_code=FINISHED prima di /media_publish.
 * Senza polling → errore "Media ID is not available".
 */
export async function pollInstagramMediaContainer(
  containerId: string,
  accessToken: string,
  options?: { maxAttempts?: number; delayMs?: number; isVideo?: boolean }
): Promise<void> {
  const isVideo = options?.isVideo ?? false;
  const maxAttempts = options?.maxAttempts ?? (isVideo ? 45 : 25);
  const delayMs = options?.delayMs ?? (isVideo ? 3000 : 2000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `${META_GRAPH_BASE}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`
    );
    const payload = (await res.json()) as {
      status_code?: string;
      status?: string;
      error?: { message?: string };
    };

    if (!res.ok || payload.error) {
      throw new Error(payload.error?.message || `Instagram container status error (${res.status})`);
    }

    const status = payload.status_code;
    console.log(
      `[POSTMAN] Instagram container ${containerId} — tentativo ${attempt}/${maxAttempts}: ${status ?? 'unknown'}`
    );

    if (status === 'FINISHED') {
      return;
    }
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(
        `Instagram: elaborazione media fallita (${status}). ${payload.status || 'Verifica che l\'URL immagine/video sia raggiungibile da Meta.'}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    'Instagram: timeout attesa elaborazione media. Riprova tra qualche minuto.'
  );
}

async function publishInstagramContainer(
  igBusinessAccountId: string,
  containerId: string,
  accessToken: string,
  pollOptions?: { isVideo?: boolean }
): Promise<string> {
  await pollInstagramMediaContainer(containerId, accessToken, pollOptions);

  const published = await metaGraphPost<{ id?: string }>(
    `/${igBusinessAccountId}/media_publish`,
    accessToken,
    { creation_id: containerId }
  );

  if (!published.id) {
    throw new Error('Meta Instagram: media id mancante dopo publish.');
  }

  return published.id;
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

  const mediaId = await publishInstagramContainer(
    igBusinessAccountId,
    container.id,
    metaAccessToken,
    { isVideo: false }
  );

  console.log(`[POSTMAN] Instagram Story pubblicata — ${mediaId}`);
  return mediaId;
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
  const { metaAccessToken, igBusinessAccountId, blobToken } = env;
  if (!metaAccessToken || !igBusinessAccountId) {
    throw new Error('META_ACCESS_TOKEN o IG_BUSINESS_ACCOUNT_ID assenti');
  }

  const caption = captionForFormat(campaign.contentFormat, campaign.copy, campaign.hashtags);
  const publicVideoUrl = await ensureSocialFetchableVideoUrl(
    campaign.id,
    campaign.videoUrl,
    blobToken
  );

  const container = await metaGraphPost<{ id?: string }>(
    `/${igBusinessAccountId}/media`,
    metaAccessToken,
    {
      media_type: 'REELS',
      video_url: publicVideoUrl,
      caption,
      share_to_feed: 'true',
    }
  );

  if (!container.id) {
    throw new Error('Meta Instagram Reel: creation_id mancante.');
  }

  const mediaId = await publishInstagramContainer(
    igBusinessAccountId,
    container.id,
    metaAccessToken,
    { isVideo: true }
  );

  console.log(`[POSTMAN] Instagram Reel pubblicato — ${mediaId}`);
  return mediaId;
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
