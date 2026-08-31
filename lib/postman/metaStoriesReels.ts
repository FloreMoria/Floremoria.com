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
  facebookPageAccessToken?: string;
  fbPageId?: string;
  igBusinessAccountId?: string;
  blobToken?: string;
};

export type FacebookReelPublishResult = {
  externalId: string;
  permalink?: string;
  /** Meta accetta finish ma codifica/publish ancora in corso in background. */
  processing?: boolean;
  publishPhase?: string;
};

function logMetaGraphPhase(
  phase: string,
  httpStatus: number,
  payload: unknown
): void {
  const p = payload as {
    error?: {
      message?: string;
      code?: number;
      type?: string;
      error_subcode?: number;
    };
  };
  if (p.error) {
    console.error(
      `[POSTMAN][FB-Reel][${phase}] HTTP ${httpStatus} · Graph code=${p.error.code ?? '?'} sub=${p.error.error_subcode ?? '?'} type=${p.error.type ?? '?'} · ${p.error.message ?? 'unknown'}`
    );
    return;
  }
  const preview = JSON.stringify(payload).slice(0, 400);
  console.log(`[POSTMAN][FB-Reel][${phase}] HTTP ${httpStatus} · ${preview}`);
}

async function metaGraphPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, string>,
  phaseLabel?: string
): Promise<T> {
  const params = new URLSearchParams({ ...body, access_token: accessToken });
  const res = await fetch(`${META_GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const payload = (await res.json()) as T & { error?: { message?: string } };
  logMetaGraphPhase(phaseLabel || `graph-post${path}`, res.status, payload);
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

export async function getFacebookPageAccessToken(
  fbPageId: string,
  userOrPageAccessToken: string
): Promise<string> {
  const directToken =
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.FB_PAGE_ACCESS_TOKEN?.trim();
  if (directToken) {
    return directToken;
  }

  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${fbPageId}?fields=access_token&access_token=${encodeURIComponent(userOrPageAccessToken)}`
    );
    const payload = (await res.json()) as { access_token?: string; error?: { message?: string } };
    if (res.ok && payload.access_token) {
      return payload.access_token;
    }
    console.warn(
      `[POSTMAN] Impossibile estrarre access_token per pagina FB ${fbPageId} (${payload.error?.message || res.status}); utilizzo token diretto come fallback.`
    );
    return userOrPageAccessToken;
  } catch (err) {
    console.warn(`[POSTMAN] Errore connessione durante recupero page token Facebook:`, err);
    return userOrPageAccessToken;
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
): Promise<{ externalId: string; permalink?: string }> {
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

  // Instagram Graph: container REELS (mai STORIES) + media_publish
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

  const permalink = await fetchInstagramPermalink(mediaId, metaAccessToken);
  console.log(
    `[POSTMAN] Instagram Reel pubblicato — ${mediaId}${permalink ? ` · ${permalink}` : ''}`
  );
  return { externalId: mediaId, permalink };
}

export async function publishToFacebookStory(
  campaign: {
    id: string;
    imageUrl: string;
  },
  env: MetaEnv
): Promise<string> {
  const { metaAccessToken, facebookPageAccessToken, fbPageId, blobToken } = env;
  const rawToken = facebookPageAccessToken || metaAccessToken;
  if (!rawToken || !fbPageId) {
    throw new Error('Credenziali Facebook mancanti: imposta FACEBOOK_PAGE_ACCESS_TOKEN (o META_ACCESS_TOKEN) e FB_PAGE_ID.');
  }

  const pageToken = await getFacebookPageAccessToken(fbPageId, rawToken);
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
): Promise<FacebookReelPublishResult> {
  const { metaAccessToken, facebookPageAccessToken, fbPageId, blobToken } = env;
  const rawToken = facebookPageAccessToken || metaAccessToken;
  if (!rawToken || !fbPageId) {
    throw new Error('Credenziali Facebook mancanti: imposta FACEBOOK_PAGE_ACCESS_TOKEN (o META_ACCESS_TOKEN) e FB_PAGE_ID (o FACEBOOK_PAGE_ID).');
  }

  const pageToken = await getFacebookPageAccessToken(fbPageId, rawToken);
  const caption = captionForFormat(campaign.contentFormat, campaign.copy, campaign.hashtags);

  console.log(`[POSTMAN][FB-Reel] Avvio campagna ${campaign.id} · pagina ${fbPageId}`);

  const publicVideoUrl = await ensureSocialFetchableVideoUrl(
    campaign.id,
    campaign.videoUrl,
    blobToken
  );

  console.log(`[POSTMAN][FB-Reel][download] GET ${publicVideoUrl.slice(0, 96)}…`);
  const fileRes = await fetch(publicVideoUrl);
  if (!fileRes.ok) {
    throw new Error(`Download video Blob fallito (HTTP ${fileRes.status}) prima dell'upload rupload.`);
  }
  const videoBytes = Buffer.from(await fileRes.arrayBuffer());
  console.log(`[POSTMAN][FB-Reel][download] HTTP ${fileRes.status} · ${videoBytes.length} bytes`);

  // Step 1 — upload_phase=start
  const started = await metaGraphPost<{ video_id?: string; upload_url?: string }>(
    `/${fbPageId}/video_reels`,
    pageToken,
    { upload_phase: 'start' },
    'start'
  );

  const videoId = started.video_id;
  if (!videoId) {
    throw new Error('Meta Facebook Reel: video_id mancante dopo upload_phase=start.');
  }

  const ruploadUrl =
    started.upload_url?.trim() ||
    `https://rupload.facebook.com/video-upload/${META_GRAPH_VERSION}/${videoId}`;

  // Step 2 — upload binario diretto su rupload (no file_url: Meta non fetcha Blob lento)
  await uploadFacebookReelBinaryBuffer(videoId, pageToken, videoBytes, ruploadUrl);

  // Step 3 — polling breve pre-finish (upload/processing)
  await waitFacebookReelProcessingReady(videoId, pageToken, {
    maxAttempts: 10,
    delayMs: 2000,
  });

  // Step 4 — upload_phase=finish + PUBLISHED
  const finished = await metaGraphPost<{ success?: boolean }>(
    `/${fbPageId}/video_reels`,
    pageToken,
    {
      upload_phase: 'finish',
      video_id: videoId,
      video_state: 'PUBLISHED',
      description: caption,
    },
    'finish'
  );

  if (finished.success === false) {
    throw new Error('Meta Facebook Reel: finish/publish non riuscito.');
  }

  // Step 5 — polling breve post-finish; se ancora in codifica → IN_PUBBLICAZIONE (non blocco)
  const publishOutcome = await ensureFacebookReelPublished(
    videoId,
    fbPageId,
    pageToken,
    caption,
    { maxAttempts: 8, delayMs: 2000 }
  );

  const permalink =
    (await fetchFacebookReelPermalink(videoId, pageToken)) ||
    `https://www.facebook.com/reel/${videoId}`;

  if (!publishOutcome.published) {
    console.warn(
      `[POSTMAN][FB-Reel] ${videoId} accettato da Meta ma ancora IN_PUBBLICAZIONE (phase=${publishOutcome.publishPhase ?? 'processing'})`
    );
    return {
      externalId: videoId,
      permalink,
      processing: true,
      publishPhase: publishOutcome.publishPhase || 'IN_PUBBLICAZIONE',
    };
  }

  console.log(`[POSTMAN][FB-Reel] Pubblicato — ${videoId} · ${permalink}`);
  return { externalId: videoId, permalink };
}

async function uploadFacebookReelBinaryBuffer(
  videoId: string,
  pageToken: string,
  bytes: Buffer,
  ruploadUrl: string
): Promise<void> {
  const uploadRes = await fetch(ruploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageToken}`,
      offset: '0',
      file_size: String(bytes.length),
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(bytes),
  });
  const payload = (await uploadRes.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string; code?: number; type?: string };
  };
  logMetaGraphPhase('rupload-binary', uploadRes.status, payload);
  if (!uploadRes.ok || payload.error || payload.success === false) {
    throw new Error(
      payload.error?.message ||
        `Meta Facebook Reel: upload binario fallito (HTTP ${uploadRes.status}).`
    );
  }
}

async function fetchFacebookReelStatus(
  videoId: string,
  pageToken: string
): Promise<{
  videoStatus?: string;
  uploading?: string;
  processing?: string;
  publishing?: string;
  publishStatus?: string;
  uploadError?: string;
  processError?: string;
  publishError?: string;
}> {
  const res = await fetch(
    `${META_GRAPH_BASE}/${videoId}?fields=status&access_token=${encodeURIComponent(pageToken)}`
  );
  const payload = (await res.json()) as {
    status?: {
      video_status?: string;
      uploading_phase?: { status?: string; error?: { message?: string; code?: number } };
      processing_phase?: { status?: string; error?: { message?: string; code?: number } };
      publishing_phase?: {
        status?: string;
        publish_status?: string;
        error?: { message?: string; code?: number };
      };
    };
    error?: { message?: string; code?: number };
  };
  logMetaGraphPhase('status', res.status, payload);
  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message || `Facebook Reel status error (${res.status})`);
  }
  const status = payload.status;
  return {
    videoStatus: status?.video_status,
    uploading: status?.uploading_phase?.status,
    processing: status?.processing_phase?.status,
    publishing: status?.publishing_phase?.status,
    publishStatus: status?.publishing_phase?.publish_status,
    uploadError: status?.uploading_phase?.error?.message,
    processError: status?.processing_phase?.error?.message,
    publishError: status?.publishing_phase?.error?.message,
  };
}

/**
 * Attende upload + processing completi prima del finish PUBLISHED.
 * Se si fa finish troppo presto Meta lascia il Reel in bozza
 * («video pronto per essere pubblicato»).
 */
async function waitFacebookReelProcessingReady(
  videoId: string,
  pageToken: string,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 10;
  const delayMs = options?.delayMs ?? 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const s = await fetchFacebookReelStatus(videoId, pageToken);
    console.log(
      `[POSTMAN][FB-Reel][pre-finish] ${videoId} ${attempt}/${maxAttempts}: video=${s.videoStatus ?? '?'} upload=${s.uploading ?? '?'} process=${s.processing ?? '?'}`
    );

    if (s.uploadError || s.processError) {
      throw new Error(
        `Meta Facebook Reel elaborazione fallita: ${s.uploadError || s.processError}`
      );
    }
    if (s.videoStatus === 'error') {
      throw new Error('Meta Facebook Reel: video_status=error durante upload/processing.');
    }

    const uploadDone = s.uploading === 'complete' || s.uploading === 'completed';
    const processDone =
      s.processing === 'complete' ||
      s.processing === 'completed' ||
      s.videoStatus === 'ready' ||
      s.videoStatus === 'processed';

    if (uploadDone && processDone) {
      return;
    }
    if (s.videoStatus === 'ready' || s.videoStatus === 'processed') {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.warn(
    `[POSTMAN][FB-Reel][pre-finish] ${videoId}: polling esaurito (${maxAttempts * (delayMs / 1000)}s) — procedo con finish.`
  );
}

/** Dopo finish: polling breve; se Meta codifica in background → published=false (non errore). */
async function ensureFacebookReelPublished(
  videoId: string,
  fbPageId: string,
  pageToken: string,
  caption: string,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<{ published: boolean; publishPhase?: string }> {
  const maxAttempts = options?.maxAttempts ?? 8;
  const delayMs = options?.delayMs ?? 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const s = await fetchFacebookReelStatus(videoId, pageToken);
    console.log(
      `[POSTMAN][FB-Reel][post-finish] ${videoId} ${attempt}/${maxAttempts}: publish_status=${s.publishStatus ?? '?'} phase=${s.publishing ?? '?'} video=${s.videoStatus ?? '?'}`
    );

    if (s.publishError) {
      throw new Error(`Meta Facebook Reel publish error: ${s.publishError}`);
    }

    if (
      s.publishStatus === 'published' ||
      s.publishing === 'completed' ||
      s.videoStatus === 'published'
    ) {
      return { published: true };
    }

    if (s.publishStatus === 'draft' || s.publishStatus === 'error' || attempt === 2 || attempt === 4) {
      console.warn(
        `[POSTMAN][FB-Reel][post-finish] ${videoId} non live (status=${s.publishStatus ?? s.publishing}) — ritento finish PUBLISHED.`
      );
      await metaGraphPost<{ success?: boolean }>(
        `/${fbPageId}/video_reels`,
        pageToken,
        {
          upload_phase: 'finish',
          video_id: videoId,
          video_state: 'PUBLISHED',
          description: caption,
        },
        'finish-retry'
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const finalStatus = await fetchFacebookReelStatus(videoId, pageToken);
  if (
    finalStatus.publishStatus === 'published' ||
    finalStatus.publishing === 'completed' ||
    finalStatus.videoStatus === 'published'
  ) {
    return { published: true };
  }

  if (finalStatus.publishError) {
    throw new Error(`Meta Facebook Reel publish error: ${finalStatus.publishError}`);
  }

  // Finish accettato ma Meta ancora in codifica — non bloccare la dashboard.
  const phase =
    finalStatus.publishStatus ||
    finalStatus.publishing ||
    finalStatus.processing ||
    finalStatus.videoStatus ||
    'IN_PUBBLICAZIONE';

  return { published: false, publishPhase: phase };
}

async function fetchInstagramPermalink(
  mediaId: string,
  accessToken: string
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${mediaId}?fields=permalink,media_type&access_token=${encodeURIComponent(accessToken)}`
    );
    const payload = (await res.json()) as {
      permalink?: string;
      media_type?: string;
      error?: { message?: string };
    };
    if (!res.ok || payload.error || !payload.permalink) return undefined;
    return payload.permalink;
  } catch {
    return undefined;
  }
}

async function fetchFacebookReelPermalink(
  videoId: string,
  pageToken: string
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${videoId}?fields=permalink_url,id&access_token=${encodeURIComponent(pageToken)}`
    );
    const payload = (await res.json()) as {
      permalink_url?: string;
      error?: { message?: string };
    };
    if (!res.ok || payload.error) return undefined;
    return payload.permalink_url || undefined;
  } catch {
    return undefined;
  }
}
