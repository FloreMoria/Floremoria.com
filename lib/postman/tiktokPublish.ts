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
  parseTikTokOAuthError,
  parseTikTokTokenFields,
} from '@/lib/dashboard/tiktokOAuth';
import { ensureMetaFetchableImageUrl } from '@/lib/postman/socialImageStaging';
import { captionForFormat } from '@/lib/postman/socialStoryCopy';
import { fetchImageBytes } from '@/lib/postman/socialPublish';
import prisma from '@/lib/prisma';

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

function buildTikTokPostInfo(
  input: TikTokPublishInput
): Record<string, unknown> {
  const caption = captionForFormat(input.contentFormat, input.copy, input.hashtags);
  return {
    title: caption.slice(0, 2200),
    privacy_level: 'PUBLIC_TO_EVERYONE',
    disable_comment: false,
    brand_content_toggle: false,
    brand_organic_toggle: true,
  };
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
}

export interface TikTokPublishResult {
  success: boolean;
  simulated?: boolean;
  externalId?: string;
  error?: string;
}

export async function getOrRefreshTikTokToken(): Promise<{ accessToken: string | null; openId: string | null }> {
  // 1. Cerca il token nel database (SystemState)
  const dbAccessToken = await prisma.systemState.findUnique({ where: { key: 'tiktok_access_token' } });
  const dbRefreshToken = await prisma.systemState.findUnique({ where: { key: 'tiktok_refresh_token' } });
  const dbExpiresAt = await prisma.systemState.findUnique({ where: { key: 'tiktok_token_expires_at' } });
  const dbOpenId = await prisma.systemState.findUnique({ where: { key: 'tiktok_open_id' } });

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();

  // Se non ci sono dati sul DB, usa le variabili d'ambiente fisse come fallback
  if (!dbAccessToken?.value || !dbRefreshToken?.value) {
    return {
      accessToken: process.env.TIKTOK_ACCESS_TOKEN?.trim() || null,
      openId: process.env.TIKTOK_OPEN_ID?.trim() || null,
    };
  }

  const expiresAt = Number(dbExpiresAt?.value || '0');
  const now = Date.now();

  // Se l'access token scade tra meno di 5 minuti, proviamo a rinfrescarlo
  if (expiresAt - now < 300_000) {
    console.log('[POSTMAN] TikTok access token in scadenza o scaduto. Tentativo di refresh...');

    if (!clientKey || !clientSecret) {
      console.warn('[POSTMAN] TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET mancanti nelle variabili d\'ambiente. Impossibile rinfrescare.');
      return { accessToken: dbAccessToken.value, openId: dbOpenId?.value || null };
    }

    try {
      const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: dbRefreshToken.value,
        }).toString(),
      });

      const payload = await res.json();
      const oauthError = parseTikTokOAuthError(payload);
      const tokens = parseTikTokTokenFields(payload);
      if (!res.ok || oauthError || !tokens) {
        console.error('[POSTMAN] Errore durante il refresh del token TikTok:', payload);
        throw new Error(oauthError || 'TikTok token refresh failed');
      }

      const { access_token: newAccess, refresh_token: newRefresh, expires_in: newExpiresIn, open_id: newOpenId, scope } =
        tokens;

      // Aggiorna nel database
      const upserts = [
        prisma.systemState.upsert({
          where: { key: 'tiktok_access_token' },
          update: { value: newAccess },
          create: { key: 'tiktok_access_token', value: newAccess },
        }),
        prisma.systemState.upsert({
          where: { key: 'tiktok_refresh_token' },
          update: { value: newRefresh },
          create: { key: 'tiktok_refresh_token', value: newRefresh },
        }),
        prisma.systemState.upsert({
          where: { key: 'tiktok_token_expires_at' },
          update: { value: String(Date.now() + newExpiresIn * 1000) },
          create: { key: 'tiktok_token_expires_at', value: String(Date.now() + newExpiresIn * 1000) },
        }),
        prisma.systemState.upsert({
          where: { key: 'tiktok_open_id' },
          update: { value: newOpenId },
          create: { key: 'tiktok_open_id', value: newOpenId },
        }),
      ];

      if (scope) {
        upserts.push(
          prisma.systemState.upsert({
            where: { key: 'tiktok_granted_scopes' },
            update: { value: scope },
            create: { key: 'tiktok_granted_scopes', value: scope },
          })
        );
      }

      await prisma.$transaction(upserts);

      console.log('[POSTMAN] TikTok token rinfrescato con successo!');
      return { accessToken: newAccess, openId: newOpenId };
    } catch (err) {
      console.error('[POSTMAN] Refresh del token TikTok fallito. Ritorno vecchio token come fallback:', err);
      return { accessToken: dbAccessToken.value, openId: dbOpenId?.value || null };
    }
  }

  return { accessToken: dbAccessToken.value, openId: dbOpenId?.value || null };
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

  const init = await tikTokApiPost<{
    data?: { publish_id?: string };
  }>('/v2/post/publish/content/init/', accessToken, {
    post_info: {
      ...buildTikTokPostInfo(input),
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

/** Post video su TikTok tramite FILE_UPLOAD (evita verifica URL ownership PULL_FROM_URL). */
async function publishTikTokVideoPost(
  input: TikTokPublishInput,
  accessToken: string
): Promise<string> {
  const videoUrl = input.videoUrl?.trim();
  if (!videoUrl) {
    throw new Error('videoUrl mancante per TikTok reel.');
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const videoBytes = await fetchImageBytes(videoUrl, blobToken);
  const contentType = videoMimeTypeFromUrl(videoUrl);
  const postInfo = buildTikTokPostInfo(input);

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
    let externalId: string;

    if (input.videoUrl?.trim() || input.contentFormat === ContentFormat.REEL) {
      externalId = await publishTikTokVideoPost(input, env.accessToken);
    } else {
      externalId = await publishTikTokPhotoPost(input, env.accessToken);
    }

    return { success: true, externalId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const error = isTikTokScopeAuthorizationError(msg)
      ? formatTikTokScopeAuthorizationError()
      : isTikTokUrlOwnershipError(msg)
        ? formatTikTokUrlOwnershipError()
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
