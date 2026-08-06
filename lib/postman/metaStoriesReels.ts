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
  const res = await fetch(
    `${META_GRAPH_BASE}/${fbPageId}?fields=access_token&access_token=${userAccessToken}`
  );
  const payload = (await res.json()) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || payload.error || !payload.access_token) {
    throw new Error(
      payload.error?.message ||
        `Page Access Token non recuperabile per ${fbPageId}. Evitato fallback user token (post dark).`
    );
  }
  return payload.access_token;
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
  const { metaAccessToken, fbPageId, blobToken } = env;
  if (!metaAccessToken || !fbPageId) {
    throw new Error('META_ACCESS_TOKEN o FB_PAGE_ID assenti');
  }

  const pageToken = await getFacebookPageAccessToken(fbPageId, metaAccessToken);
  const caption = captionForFormat(campaign.contentFormat, campaign.copy, campaign.hashtags);

  // Meta richiede URL pubblico fetchabile da facebookexternalhit (no Blob privato).
  const publicVideoUrl = await ensureSocialFetchableVideoUrl(
    campaign.id,
    campaign.videoUrl,
    blobToken
  );

  // Step 1 — inizializza sessione upload
  const started = await metaGraphPost<{ video_id?: string; upload_url?: string }>(
    `/${fbPageId}/video_reels`,
    pageToken,
    { upload_phase: 'start' }
  );

  const videoId = started.video_id;
  if (!videoId) {
    throw new Error('Meta Facebook Reel: video_id mancante dopo upload_phase=start.');
  }

  console.log(`[POSTMAN] Facebook Reel session start — video_id ${videoId}`);

  // Step 2 — upload file hosted su rupload.facebook.com
  const ruploadUrl =
    started.upload_url?.trim() ||
    `https://rupload.facebook.com/video-upload/${META_GRAPH_VERSION}/${videoId}`;

  const uploadRes = await fetch(ruploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageToken}`,
      file_url: publicVideoUrl,
    },
  });

  const uploadPayload = (await uploadRes.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };

  if (!uploadRes.ok || uploadPayload.error || uploadPayload.success === false) {
    // Fallback: upload binario se file_url viene rifiutato (CDN/robots).
    console.warn(
      `[POSTMAN] Facebook Reel file_url fallito (${uploadPayload.error?.message || uploadRes.status}); provo upload binario.`
    );
    await uploadFacebookReelBinary(videoId, pageToken, campaign.videoUrl, blobToken);
  } else {
    console.log(`[POSTMAN] Facebook Reel rupload file_url OK — ${videoId}`);
  }

  await waitFacebookReelUploadReady(videoId, pageToken);

  // Step 3 — finish + publish
  const finished = await metaGraphPost<{ success?: boolean }>(`/${fbPageId}/video_reels`, pageToken, {
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    description: caption,
  });

  if (finished.success === false) {
    throw new Error('Meta Facebook Reel: finish/publish non riuscito.');
  }

  console.log(`[POSTMAN] Facebook Reel pubblicato — ${videoId}`);
  return videoId;
}

async function uploadFacebookReelBinary(
  videoId: string,
  pageToken: string,
  videoUrl: string,
  blobToken?: string
): Promise<void> {
  const publicOrSource = await ensureSocialFetchableVideoUrl(
    `fb-reel-bin-${videoId}`,
    videoUrl,
    blobToken
  );
  const fileRes = await fetch(publicOrSource);
  if (!fileRes.ok) {
    throw new Error(`Download video per rupload binario fallito (${fileRes.status}).`);
  }
  const bytes = Buffer.from(await fileRes.arrayBuffer());
  const ruploadUrl = `https://rupload.facebook.com/video-upload/${META_GRAPH_VERSION}/${videoId}`;
  const uploadRes = await fetch(ruploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageToken}`,
      offset: '0',
      file_size: String(bytes.length),
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  });
  const payload = (await uploadRes.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };
  if (!uploadRes.ok || payload.error || payload.success === false) {
    throw new Error(
      payload.error?.message ||
        `Meta Facebook Reel: upload binario fallito (${uploadRes.status}).`
    );
  }
}

async function waitFacebookReelUploadReady(
  videoId: string,
  pageToken: string,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 40;
  const delayMs = options?.delayMs ?? 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `${META_GRAPH_BASE}/${videoId}?fields=status&access_token=${encodeURIComponent(pageToken)}`
    );
    const payload = (await res.json()) as {
      status?: {
        video_status?: string;
        uploading_phase?: { status?: string; error?: { message?: string } };
        processing_phase?: { status?: string; error?: { message?: string } };
        publishing_phase?: { status?: string; error?: { message?: string } };
      };
      error?: { message?: string };
    };

    if (!res.ok || payload.error) {
      throw new Error(payload.error?.message || `Facebook Reel status error (${res.status})`);
    }

    const status = payload.status;
    const uploading = status?.uploading_phase?.status;
    const processing = status?.processing_phase?.status;
    const videoStatus = status?.video_status;

    console.log(
      `[POSTMAN] Facebook Reel ${videoId} — tentativo ${attempt}/${maxAttempts}: video=${videoStatus ?? '?'} upload=${uploading ?? '?'} process=${processing ?? '?'}`
    );

    const uploadErr = status?.uploading_phase?.error?.message;
    const processErr = status?.processing_phase?.error?.message;
    if (uploadErr || processErr) {
      throw new Error(
        `Meta Facebook Reel elaborazione fallita: ${uploadErr || processErr}`
      );
    }

    // Pronto per finish quando upload completo (processing può continuare dopo publish).
    if (uploading === 'complete' || videoStatus === 'ready' || videoStatus === 'upload_complete') {
      return;
    }

    // Alcune risposte omettono i sotto-status ma segnalano errore esplicito.
    if (videoStatus === 'error') {
      throw new Error('Meta Facebook Reel: video_status=error durante upload.');
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Non bloccare forever: Meta accetta spesso finish anche se processing è ancora in corso.
  console.warn(
    `[POSTMAN] Facebook Reel ${videoId}: timeout attesa status — procedo con upload_phase=finish.`
  );
}
