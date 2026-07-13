/**
 * TikTok Content Posting API v2 — post foto (feed) e video (reel).
 * @see https://developers.tiktok.com/doc/content-posting-api-get-started
 */
import { ContentFormat } from '@prisma/client';
import {
  formatTikTokScopeAuthorizationError,
  formatTikTokUrlOwnershipError,
  isTikTokScopeAuthorizationError,
  isTikTokUrlOwnershipError,
} from '@/lib/dashboard/tiktokOAuth';
import {
  buildTikTokPostInfoFromUx,
  defaultTikTokPublishUxOptions,
  fetchTikTokCreatorInfo,
  formatTikTokGuidelinesError,
  isTikTokGuidelinesError,
  type TikTokCreatorInfo,
  type TikTokPublishUxOptions,
  validateTikTokPublishUxOptions,
} from '@/lib/postman/tiktokCreatorInfo';
import { ensureMetaFetchableImageUrl } from '@/lib/postman/socialImageStaging';
import { captionForFormat } from '@/lib/postman/socialStoryCopy';
import { fetchImageBytes } from '@/lib/postman/socialPublish';
import { getOrRefreshTikTokToken } from '@/lib/postman/tiktokToken';

export { getOrRefreshTikTokToken } from '@/lib/postman/tiktokToken';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';
const TIKTOK_MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const TIKTOK_DEFAULT_CHUNK_BYTES = 10 * 1024 * 1024;
const TIKTOK_MAX_CHUNK_BYTES = 64 * 1024 * 1024;

function videoMimeTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.mov')) return 'video/quicktime';
  if (lower.includes('.webm')) return 'video/webm';
  return 'video/mp4';
}

function planTikTokVideoChunks(videoSize: number): { chunkSize: number; totalChunkCount: number } {
  if (videoSize <= TIKTOK_MIN_CHUNK_BYTES) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }

  const chunkSize = Math.min(TIKTOK_DEFAULT_CHUNK_BYTES, TIKTOK_MAX_CHUNK_BYTES);
  return {
    chunkSize,
    totalChunkCount: Math.ceil(videoSize / chunkSize),
  };
}

function parseTikTokApiError(payload: { error?: { code?: string; message?: string } }): void {
  const code = payload.error?.code;
  if (code && code !== 'ok') {
    throw new Error(payload.error?.message || code);
  }
}

async function tikTokApiPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown> = {}
): Promise<T & { data?: Record<string, unknown>; error?: { code?: string; message?: string } }> {
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

  if (!res.ok) {
    throw new Error(payload.error?.message || `TikTok API error (${res.status})`);
  }

  parseTikTokApiError(payload);
  return payload;
}

async function uploadTikTokVideoBytes(
  videoBytes: Buffer,
  accessToken: string,
  postInfo: Record<string, unknown>,
  contentType: string
): Promise<string> {
  const videoSize = videoBytes.length;
  const { chunkSize, totalChunkCount } = planTikTokVideoChunks(videoSize);

  const init = await tikTokApiPost<{
    data?: { publish_id?: string; upload_url?: string };
  }>('/v2/post/publish/video/init/', accessToken, {
    post_info: postInfo,
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: videoSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount,
    },
  });

  const uploadUrl = init.data?.upload_url;
  const publishId = init.data?.publish_id;
  if (!uploadUrl || !publishId) {
    throw new Error('TikTok upload_url o publish_id mancante.');
  }

  for (let chunkIndex = 0; chunkIndex < totalChunkCount; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, videoSize) - 1;
    const chunk = videoBytes.subarray(start, end + 1);

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${videoSize}`,
      },
      body: new Uint8Array(chunk),
    });

    if (res.status !== 201 && res.status !== 206) {
      const body = await res.text().catch(() => '');
      throw new Error(`TikTok video upload fallito (${res.status})${body ? `: ${body}` : ''}`);
    }

    if (res.status === 201) {
      break;
    }
  }

  return publishId;
}

export interface TikTokPublishInput {
  campaignId: string;
  contentFormat: ContentFormat;
  copy: string;
  hashtags: string[];
  imageUrl: string;
  videoUrl?: string | null;
  tiktokUx?: TikTokPublishUxOptions;
}

export interface TikTokPublishResult {
  success: boolean;
  simulated?: boolean;
  externalId?: string;
  error?: string;
  privatePost?: boolean;
}

function resolveTikTokUx(
  creatorInfo: TikTokCreatorInfo,
  ux?: TikTokPublishUxOptions
): TikTokPublishUxOptions {
  if (ux) return { ...ux };
  const defaults = defaultTikTokPublishUxOptions(creatorInfo);
  defaults.musicUsageConsent = true;
  return defaults;
}

/** Post foto su TikTok (feed giornaliero). */
async function publishTikTokPhotoPost(
  input: TikTokPublishInput,
  accessToken: string,
  creatorInfo: TikTokCreatorInfo,
  ux: TikTokPublishUxOptions
): Promise<string> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const publicImageUrl = await ensureMetaFetchableImageUrl(
    input.campaignId,
    input.imageUrl,
    blobToken
  );

  const caption = captionForFormat(input.contentFormat, input.copy, input.hashtags);
  const postInfo = buildTikTokPostInfoFromUx(caption, creatorInfo, ux, false);

  const init = await tikTokApiPost<{
    data?: { publish_id?: string };
  }>('/v2/post/publish/content/init/', accessToken, {
    post_info: postInfo,
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

/** Post video su TikTok tramite FILE_UPLOAD. */
async function publishTikTokVideoPost(
  input: TikTokPublishInput,
  accessToken: string,
  creatorInfo: TikTokCreatorInfo,
  ux: TikTokPublishUxOptions
): Promise<string> {
  const videoUrl = input.videoUrl?.trim();
  if (!videoUrl) {
    throw new Error('videoUrl mancante per TikTok reel.');
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const videoBytes = await fetchImageBytes(videoUrl, blobToken);
  const contentType = videoMimeTypeFromUrl(videoUrl);
  const caption = captionForFormat(input.contentFormat, input.copy, input.hashtags);
  const postInfo = buildTikTokPostInfoFromUx(caption, creatorInfo, ux, true);

  const publishId = await uploadTikTokVideoBytes(videoBytes, accessToken, postInfo, contentType);

  console.log(`[POSTMAN] TikTok video caricato via FILE_UPLOAD — publish_id ${publishId}`);
  return publishId;
}

export async function publishToTikTok(input: TikTokPublishInput): Promise<TikTokPublishResult> {
  const env = await getOrRefreshTikTokToken();

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
    const creatorInfo = await fetchTikTokCreatorInfo(env.accessToken);
    const isVideo = Boolean(input.videoUrl?.trim() || input.contentFormat === ContentFormat.REEL);
    const ux = resolveTikTokUx(creatorInfo, input.tiktokUx);

    const validationError = validateTikTokPublishUxOptions(creatorInfo, ux, isVideo);
    if (validationError) {
      return { success: false, error: validationError };
    }

    let externalId: string;

    if (isVideo) {
      externalId = await publishTikTokVideoPost(input, env.accessToken, creatorInfo, ux);
    } else {
      externalId = await publishTikTokPhotoPost(input, env.accessToken, creatorInfo, ux);
    }

    return {
      success: true,
      externalId,
      privatePost: ux.privacyLevel === 'SELF_ONLY',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const error = isTikTokScopeAuthorizationError(msg)
      ? formatTikTokScopeAuthorizationError()
      : isTikTokUrlOwnershipError(msg)
        ? formatTikTokUrlOwnershipError()
        : isTikTokGuidelinesError(msg)
          ? formatTikTokGuidelinesError(true)
          : msg;
    console.error(`[POSTMAN] TikTok errore campagna ${input.campaignId}: ${msg}`);
    return { success: false, error };
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
