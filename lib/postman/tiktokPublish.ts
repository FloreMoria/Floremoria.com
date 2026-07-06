/**
 * TikTok Content Posting API v2 — post foto (feed) e video (reel).
 * @see https://developers.tiktok.com/doc/content-posting-api-get-started
 */
import { ContentFormat } from '@prisma/client';
import { ensureMetaFetchableImageUrl } from '@/lib/postman/socialImageStaging';
import { captionForFormat } from '@/lib/postman/socialStoryCopy';
import { fetchImageBytes } from '@/lib/postman/socialPublish';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';

export interface TikTokPublishInput {
  campaignId: string;
  contentFormat: ContentFormat;
  copy: string;
  hashtags: string[];
  imageUrl: string;
  videoUrl?: string | null;
}

export interface TikTokPublishResult {
  success: boolean;
  simulated?: boolean;
  externalId?: string;
  error?: string;
}

function readTikTokEnv() {
  return {
    accessToken: process.env.TIKTOK_ACCESS_TOKEN?.trim(),
    openId: process.env.TIKTOK_OPEN_ID?.trim(),
  };
}

async function tikTokApiPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${TIKTOK_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json()) as T & {
    error?: { code?: string; message?: string };
  };

  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message || `TikTok API error (${res.status})`);
  }

  return payload;
}

/** Post foto su TikTok (feed giornaliero). */
async function publishTikTokPhotoPost(
  input: TikTokPublishInput,
  accessToken: string
): Promise<string> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const publicImageUrl = await ensureMetaFetchableImageUrl(
    input.campaignId,
    input.imageUrl,
    blobToken
  );

  const caption = captionForFormat(input.contentFormat, input.copy, input.hashtags);

  const init = await tikTokApiPost<{
    data?: { publish_id?: string };
  }>('/v2/post/publish/content/init/', accessToken, {
    post_info: {
      title: caption.slice(0, 2200),
      privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_comment: false,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_cover_index: 0,
      photo_images: [publicImageUrl],
    },
    post_mode: 'DIRECT_POST',
    media_type: 'PHOTO',
  });

  const publishId = init.data?.publish_id;
  if (!publishId) {
    throw new Error('TikTok photo publish_id mancante.');
  }

  console.log(`[POSTMAN] TikTok photo pubblicato — publish_id ${publishId}`);
  return publishId;
}

/** Post video su TikTok (reel ogni 3 giorni). */
async function publishTikTokVideoPost(
  input: TikTokPublishInput,
  accessToken: string
): Promise<string> {
  const videoUrl = input.videoUrl?.trim();
  if (!videoUrl) {
    throw new Error('videoUrl mancante per TikTok reel.');
  }

  const caption = captionForFormat(input.contentFormat, input.copy, input.hashtags);

  const init = await tikTokApiPost<{
    data?: { publish_id?: string };
  }>('/v2/post/publish/video/init/', accessToken, {
    post_info: {
      title: caption.slice(0, 2200),
      privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_comment: false,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: videoUrl,
    },
  });

  const publishId = init.data?.publish_id;
  if (!publishId) {
    throw new Error('TikTok video publish_id mancante.');
  }

  console.log(`[POSTMAN] TikTok video pubblicato — publish_id ${publishId}`);
  return publishId;
}

export async function publishToTikTok(input: TikTokPublishInput): Promise<TikTokPublishResult> {
  const env = readTikTokEnv();

  if (!env.accessToken) {
    console.warn(
      `[POSTMAN] TIKTOK_ACCESS_TOKEN assente — pubblicazione simulata (campagna ${input.campaignId})`
    );
    return {
      success: true,
      simulated: true,
      externalId: `simulated-tiktok-${input.campaignId}`,
    };
  }

  try {
    let externalId: string;

    if (input.contentFormat === ContentFormat.REEL) {
      externalId = await publishTikTokVideoPost(input, env.accessToken);
    } else {
      externalId = await publishTikTokPhotoPost(input, env.accessToken);
    }

    return { success: true, externalId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[POSTMAN] TikTok errore campagna ${input.campaignId}: ${msg}`);
    return { success: false, error: msg };
  }
}

/** Verifica che l'immagine sia scaricabile (usato in test). */
export async function verifyTikTokImageReady(imageUrl: string): Promise<boolean> {
  try {
    await fetchImageBytes(imageUrl, process.env.BLOB_READ_WRITE_TOKEN?.trim());
    return true;
  } catch {
    return false;
  }
}
