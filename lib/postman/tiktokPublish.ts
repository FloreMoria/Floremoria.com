/**
 * TikTok Content Posting API v2 — post foto (feed) e video (reel).
 * Direct Post: /v2/post/publish/video/init/ (scope video.publish)
 * Inbox Upload: /v2/post/publish/inbox/video/init/ (scope video.upload)
 * @see https://developers.tiktok.com/doc/content-posting-api-get-started
 */
import { ContentFormat } from '@prisma/client';
import {
  classifyTikTokApiFailure,
  formatTikTokScopeAuthorizationError,
  formatTikTokUnauditedClientError,
  formatTikTokUrlOwnershipError,
  getTikTokPublishCapability,
  hasTikTokPublishScopes,
  isTikTokScopeAuthorizationError,
  isTikTokUnauditedClientError,
  isTikTokUrlOwnershipError,
  logTikTokApiVerbal,
  parseTikTokGrantedScopes,
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
import {
  ensureMetaFetchableImageUrl,
  ensureSocialFetchableVideoUrl,
} from '@/lib/postman/socialImageStaging';
import { captionForFormat } from '@/lib/postman/socialStoryCopy';
import { fetchImageBytes } from '@/lib/postman/socialPublish';
import {
  getOrRefreshTikTokToken,
  getStoredTikTokGrantedScopes,
} from '@/lib/postman/tiktokToken';

export { getOrRefreshTikTokToken } from '@/lib/postman/tiktokToken';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';
const TIKTOK_MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const TIKTOK_DEFAULT_CHUNK_BYTES = 10 * 1024 * 1024;
const TIKTOK_MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const TIKTOK_API_TIMEOUT_MS = 120_000;
const TIKTOK_MEDIA_PREFLIGHT_TIMEOUT_MS = 25_000;

type TikTokErrorBody = {
  code?: string;
  message?: string;
  log_id?: string;
};

function formatTikTokNetworkError(context: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (/timeout|aborted|AbortError/i.test(raw) || name === 'TimeoutError' || name === 'AbortError') {
    return (
      `Timeout di rete verso TikTok (${context}). ` +
      'Verifica che l\'URL del video B-roll sia HTTPS raggiungibile e che l\'Access Token non sia scaduto; poi riprova.'
    );
  }
  if (/fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket|network|Failed to fetch/i.test(raw)) {
    return (
      `Connessione a TikTok fallita (${context}): ${raw}. ` +
      'Possibili cause: rete/DNS, URL video non raggiungibile da TikTok, oppure Access Token da rinnovare (Riautorizza TikTok).'
    );
  }
  return `Errore di rete TikTok (${context}): ${raw}`;
}

function isLikelyNetworkFailure(err: unknown): boolean {
  const raw = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /timeout|aborted|AbortError|fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket|network|Failed to fetch/i.test(
    raw
  );
}

function videoMimeTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.mov')) return 'video/quicktime';
  if (lower.includes('.webm')) return 'video/webm';
  return 'video/mp4';
}

function planTikTokVideoChunks(videoSize: number): {
  chunkSize: number;
  totalChunkCount: number;
} {
  if (videoSize <= TIKTOK_MIN_CHUNK_BYTES) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }

  const chunkSize = Math.min(TIKTOK_DEFAULT_CHUNK_BYTES, TIKTOK_MAX_CHUNK_BYTES);
  return {
    chunkSize,
    totalChunkCount: Math.ceil(videoSize / chunkSize),
  };
}

function extractTikTokError(payload: unknown): TikTokErrorBody {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  const err = root.error;
  if (!err || typeof err !== 'object') {
    return {
      log_id: typeof root.log_id === 'string' ? root.log_id : undefined,
    };
  }
  const e = err as Record<string, unknown>;
  return {
    code: typeof e.code === 'string' ? e.code : undefined,
    message: typeof e.message === 'string' ? e.message : undefined,
    log_id:
      typeof e.log_id === 'string'
        ? e.log_id
        : typeof root.log_id === 'string'
          ? root.log_id
          : undefined,
  };
}

function throwTikTokApiError(
  context: string,
  payload: unknown,
  httpStatus?: number
): never {
  const err = extractTikTokError(payload);
  const classification = classifyTikTokApiFailure({
    code: err.code,
    message: err.message,
    httpStatus,
  });
  // Verbale completo: body errore TikTok (code / message / log_id) + payload grezzo.
  logTikTokApiVerbal(`API_FAIL:${context}`, {
    httpStatus: httpStatus ?? null,
    error: {
      code: err.code ?? null,
      message: err.message ?? null,
      log_id: err.log_id ?? null,
    },
    classification,
    fullErrorBody: payload,
  });
  console.error(
    `[TikTok Verbale] RAW_ERROR context=${context} http=${httpStatus ?? 'n/a'} ` +
      `code=${err.code ?? 'n/a'} message=${err.message ?? 'n/a'} log_id=${err.log_id ?? 'n/a'} ` +
      `body=${JSON.stringify(payload).slice(0, 4000)}`
  );
  throw new Error(
    `[TikTok ${context}] code=${err.code || 'n/a'} message=${err.message || 'n/a'} log_id=${err.log_id || 'n/a'} class=${classification}`
  );
}

function parseTikTokApiError(context: string, payload: unknown): void {
  const err = extractTikTokError(payload);
  if (err.code && err.code !== 'ok') {
    throwTikTokApiError(context, payload);
  }
}

async function tikTokApiPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown> = {},
  context = path
): Promise<T & { data?: Record<string, unknown>; error?: TikTokErrorBody }> {
  let res: Response;
  try {
    res = await fetch(`${TIKTOK_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIKTOK_API_TIMEOUT_MS),
    });
  } catch (err) {
    const message = formatTikTokNetworkError(context, err);
    logTikTokApiVerbal(`API_NETWORK_FAIL:${context}`, {
      path,
      message,
      detail: err instanceof Error ? err.message : String(err),
    });
    throw new Error(message);
  }

  const rawText = await res.text().catch(() => '');
  let payload: T & { data?: Record<string, unknown>; error?: TikTokErrorBody };

  try {
    payload = (rawText ? JSON.parse(rawText) : {}) as typeof payload;
  } catch {
    const preview = rawText.slice(0, 400).replace(/\s+/g, ' ');
    const is413 =
      res.status === 413 ||
      /request entity too large|payload too large|413/i.test(rawText);
    const isHtml = /<!doctype html|<html/i.test(rawText);
    logTikTokApiVerbal(`API_NON_JSON:${context}`, {
      httpStatus: res.status,
      path,
      is413,
      isHtml,
      bodyPreview: preview,
    });
    if (is413) {
      throw new Error(
        'Payload o file video troppo grande per il caricamento diretto (HTTP 413). ' +
          'Usa un URL B-roll HTTPS pubblico (PULL_FROM_URL) più leggero o riduci la durata/risoluzione del Reel.'
      );
    }
    throw new Error(
      `TikTok ha restituito una risposta non-JSON (HTTP ${res.status}) su ${path}` +
        (preview ? `: ${preview}` : '') +
        '. Possibile timeout gateway, HTML di errore o token da rinnovare.'
    );
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        'Payload o file video troppo grande per il caricamento diretto (HTTP 413). ' +
          'Verificare l\'URL B-roll HTTPS (PULL_FROM_URL) e non inviare buffer pesanti nel body.'
      );
    }
    throwTikTokApiError(context, payload, res.status);
  }

  parseTikTokApiError(context, payload);
  return payload;
}

async function uploadTikTokVideoBytes(
  videoBytes: Buffer,
  accessToken: string,
  postInfo: Record<string, unknown> | null,
  contentType: string,
  mode: 'direct' | 'inbox'
): Promise<string> {
  const videoSize = videoBytes.length;
  const { chunkSize, totalChunkCount } = planTikTokVideoChunks(videoSize);
  const initPath =
    mode === 'direct'
      ? '/v2/post/publish/video/init/'
      : '/v2/post/publish/inbox/video/init/';

  const initBody: Record<string, unknown> = {
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: videoSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount,
    },
  };
  if (mode === 'direct' && postInfo) {
    initBody.post_info = postInfo;
  }

  logTikTokApiVerbal('VIDEO_INIT_START', {
    mode,
    initPath,
    videoSize,
    chunkSize,
    totalChunkCount,
    post_info: postInfo,
    source_info: initBody.source_info,
  });

  console.log(
    `[TikTok Verbale] VIDEO_INIT_REQUEST path=${initPath} body=${JSON.stringify(initBody).slice(0, 2500)}`
  );

  const init = await tikTokApiPost<{
    data?: { publish_id?: string; upload_url?: string };
  }>(initPath, accessToken, initBody, `video_init_${mode}`);

  const uploadUrl = init.data?.upload_url;
  const publishId = init.data?.publish_id;
  if (!uploadUrl || !publishId) {
    throwTikTokApiError(`video_init_${mode}_missing_fields`, init);
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
      const bodyText = await res.text().catch(() => '');
      logTikTokApiVerbal('VIDEO_CHUNK_FAIL', {
        mode,
        chunkIndex,
        httpStatus: res.status,
        bodyPreview: bodyText.slice(0, 600),
      });
      throw new Error(
        `TikTok video upload fallito (${res.status}) chunk=${chunkIndex}${bodyText ? `: ${bodyText.slice(0, 400)}` : ''}`
      );
    }

    if (res.status === 201) {
      break;
    }
  }

  logTikTokApiVerbal('VIDEO_UPLOAD_OK', { mode, publishId, videoSize });
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

/** Post foto su TikTok (feed) — Content Posting v2 Direct Post. */
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
  }>(
    '/v2/post/publish/content/init/',
    accessToken,
    {
      post_info: postInfo,
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: [publicImageUrl],
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    },
    'photo_content_init'
  );

  const publishId = init.data?.publish_id;
  if (!publishId) {
    throwTikTokApiError('photo_publish_id_missing', init);
  }

  console.log(`[POSTMAN] TikTok photo pubblicato — publish_id ${publishId}`);
  return publishId;
}

/** Pre-flight: URL HTTPS pubblico e scaricabile prima di /video/init/. */
async function assertPublicHttpsVideoUrl(url: string): Promise<void> {
  if (!/^https:\/\//i.test(url)) {
    throw new Error(
      `Pre-flight video fallito: l'URL B-roll non è HTTPS pubblico (${url.slice(0, 120)}). ` +
        'Rigenera il Reel Ziggy/Pexels o verifica lo staging Blob.'
    );
  }

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return 'invalid-host';
    }
  })();

  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIKTOK_MEDIA_PREFLIGHT_TIMEOUT_MS),
    });
    if (head.ok) {
      logTikTokApiVerbal('MEDIA_PREFLIGHT_OK', {
        urlHost: host,
        status: head.status,
        contentType: head.headers.get('content-type'),
        contentLength: head.headers.get('content-length'),
      });
      return;
    }
    // Alcuni CDN non espongono HEAD: prova Range GET minimo.
    const get = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIKTOK_MEDIA_PREFLIGHT_TIMEOUT_MS),
    });
    if (!get.ok && get.status !== 206) {
      throw new Error(
        `Pre-flight video fallito: URL B-roll non scaricabile (HTTP ${get.status}) da ${host}. ` +
          'TikTok non potrà recuperare il media — verifica staging HTTPS o rigenera il Reel.'
      );
    }
    logTikTokApiVerbal('MEDIA_PREFLIGHT_OK_RANGE', {
      urlHost: host,
      status: get.status,
    });
  } catch (e) {
    if (e instanceof Error && /Pre-flight video fallito/.test(e.message)) {
      throw e;
    }
    const message = formatTikTokNetworkError('media_preflight', e);
    logTikTokApiVerbal('MEDIA_PREFLIGHT_FAIL', {
      urlPreview: url.slice(0, 180),
      message,
    });
    throw new Error(
      `Pre-flight video fallito su ${host}: ${message}. ` +
        'L\'URL del B-roll non è raggiungibile prima della chiamata a /v2/post/publish/video/init/.'
    );
  }
}

/**
 * Direct Post via PULL_FROM_URL (preferito se il B-roll Ziggy/Pexels è già su HTTPS pubblico).
 */
async function initTikTokVideoPullFromUrl(
  accessToken: string,
  postInfo: Record<string, unknown>,
  videoUrl: string
): Promise<string> {
  const initBody = {
    post_info: postInfo,
    source_info: {
      source: 'PULL_FROM_URL' as const,
      video_url: videoUrl,
    },
  };
  console.log(
    `[TikTok Verbale] VIDEO_INIT_PULL_REQUEST body=${JSON.stringify({
      post_info: postInfo,
      source_info: { source: 'PULL_FROM_URL', video_url: videoUrl.slice(0, 200) },
    })}`
  );
  const init = await tikTokApiPost<{
    data?: { publish_id?: string };
  }>('/v2/post/publish/video/init/', accessToken, initBody, 'video_init_pull');

  const publishId = init.data?.publish_id;
  if (!publishId) {
    throwTikTokApiError('video_init_pull_missing_publish_id', init);
  }
  return publishId;
}

/** Video: Direct Post (video.publish) oppure Inbox (video.upload). */
async function publishTikTokVideoPost(
  input: TikTokPublishInput,
  accessToken: string,
  creatorInfo: TikTokCreatorInfo,
  ux: TikTokPublishUxOptions,
  capability: ReturnType<typeof getTikTokPublishCapability>
): Promise<string> {
  const videoUrl = input.videoUrl?.trim();
  if (!videoUrl) {
    throw new Error('videoUrl mancante per TikTok reel.');
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  // Espone B-roll Ziggy/Pexels come HTTPS pubblico scaricabile (staging se Blob privato).
  const publicVideoUrl = await ensureSocialFetchableVideoUrl(
    input.campaignId,
    videoUrl,
    blobToken
  );
  await assertPublicHttpsVideoUrl(publicVideoUrl);

  const caption = captionForFormat(input.contentFormat, input.copy, input.hashtags);
  const postInfo = capability.canDirectPost
    ? buildTikTokPostInfoFromUx(caption, creatorInfo, ux, true)
    : null;

  if (postInfo) {
    logTikTokApiVerbal('POST_INFO_READY', {
      titlePreview: String(postInfo.title || '').slice(0, 120),
      privacy_level: postInfo.privacy_level,
      disable_comment: postInfo.disable_comment,
      disable_duet: postInfo.disable_duet,
      disable_stitch: postInfo.disable_stitch,
      creatorPrivacyOptions: creatorInfo.privacyLevelOptions,
    });
  }

  if (capability.canDirectPost && postInfo) {
    // Priorità Content Posting v2: solo URL HTTPS nel body (PULL_FROM_URL), mai Base64.
    try {
      const publishId = await initTikTokVideoPullFromUrl(
        accessToken,
        postInfo,
        publicVideoUrl
      );
      console.log(
        `[POSTMAN] TikTok video Direct Post PULL_FROM_URL — publish_id ${publishId}`
      );
      return publishId;
    } catch (pullErr) {
      const pullMsg = pullErr instanceof Error ? pullErr.message : String(pullErr);
      const pullClass = classifyTikTokApiFailure({ message: pullMsg });
      logTikTokApiVerbal('PULL_FROM_URL_FAILED', {
        reason: pullMsg,
        classification: pullClass,
        publicVideoUrl: publicVideoUrl.slice(0, 220),
      });
      // Auth / audit / 413: non ritentare con upload chunk pesante.
      if (
        pullClass === 'client_audit' ||
        pullClass === 'scope_permission' ||
        isTikTokUnauditedClientError(pullMsg) ||
        isTikTokScopeAuthorizationError(pullMsg) ||
        /413|troppo grande|entity too large/i.test(pullMsg)
      ) {
        throw pullErr instanceof Error ? pullErr : new Error(pullMsg);
      }

      // Fallback FILE_UPLOAD solo per clip piccole (mai Base64 nel body Next/TikTok init).
      const MAX_FILE_UPLOAD_BYTES = 20 * 1024 * 1024;
      let videoBytes: Buffer;
      try {
        videoBytes = await fetchImageBytes(publicVideoUrl, blobToken);
      } catch {
        throw new Error(
          `PULL_FROM_URL fallito (${pullMsg}) e download B-roll per FILE_UPLOAD non riuscito. ` +
            `Verificare l'URL HTTPS pubblico: ${publicVideoUrl.slice(0, 160)}`
        );
      }
      if (videoBytes.length > MAX_FILE_UPLOAD_BYTES) {
        throw new Error(
          `PULL_FROM_URL fallito (${pullMsg}). Il video (${Math.round(videoBytes.length / (1024 * 1024))}MB) ` +
            'è troppo grande per FILE_UPLOAD in funzione serverless — correggere URL B-roll HTTPS raggiungibile da TikTok.'
        );
      }
      const contentType = videoMimeTypeFromUrl(publicVideoUrl);
      const publishId = await uploadTikTokVideoBytes(
        videoBytes,
        accessToken,
        postInfo,
        contentType,
        'direct'
      );
      console.log(
        `[POSTMAN] TikTok video Direct Post FILE_UPLOAD (fallback piccolo) — publish_id ${publishId}`
      );
      return publishId;
    }
  }

  if (capability.canInboxUpload) {
    // Inbox richiede FILE_UPLOAD: limita dimensione per evitare 413 / OOM.
    const MAX_INBOX_BYTES = 32 * 1024 * 1024;
    const videoBytes = await fetchImageBytes(publicVideoUrl, blobToken);
    if (videoBytes.length > MAX_INBOX_BYTES) {
      throw new Error(
        'Payload o file video troppo grande per Inbox Upload. ' +
          'Serve Direct Post con PULL_FROM_URL (scope video.publish) su URL B-roll HTTPS pubblico.'
      );
    }
    const contentType = videoMimeTypeFromUrl(publicVideoUrl);
    const publishId = await uploadTikTokVideoBytes(
      videoBytes,
      accessToken,
      null,
      contentType,
      'inbox'
    );
    console.log(
      `[POSTMAN] TikTok video Inbox Upload (Content Posting v2) — publish_id ${publishId}`
    );
    return publishId;
  }

  throw new Error(formatTikTokScopeAuthorizationError());
}

export async function publishToTikTok(input: TikTokPublishInput): Promise<TikTokPublishResult> {
  const env = await getOrRefreshTikTokToken({ requireFresh: true });

  if (env.tokenError && !env.accessToken) {
    logTikTokApiVerbal('PUBLISH_BLOCKED_TOKEN', {
      campaignId: input.campaignId,
      tokenError: env.tokenError,
      expiresAt: env.expiresAt ?? null,
    });
    return { success: false, error: env.tokenError };
  }

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

  if (env.tokenError) {
    // Token ancora usabile ma refresh ha segnalato problemi: logga e prosegui.
    console.warn(`[POSTMAN] TikTok token warning: ${env.tokenError}`);
  }

  const grantedScopes = (await getStoredTikTokGrantedScopes()) || '';
  const capability = getTikTokPublishCapability(grantedScopes);

  logTikTokApiVerbal('PUBLISH_START', {
    campaignId: input.campaignId,
    contentFormat: input.contentFormat,
    hasVideoUrl: Boolean(input.videoUrl?.trim()),
    grantedScopes: parseTikTokGrantedScopes(grantedScopes),
    capability,
    tokenExpiresAt: env.expiresAt ?? null,
  });

  if (!hasTikTokPublishScopes(grantedScopes)) {
    logTikTokApiVerbal('PUBLISH_BLOCKED_SCOPES', {
      campaignId: input.campaignId,
      grantedScopes,
      required: 'video.publish e/o video.upload',
    });
    return { success: false, error: formatTikTokScopeAuthorizationError() };
  }

  try {
    const creatorInfo = await fetchTikTokCreatorInfo(env.accessToken);
    const isVideo = Boolean(
      input.videoUrl?.trim() || input.contentFormat === ContentFormat.REEL
    );
    const ux = resolveTikTokUx(creatorInfo, input.tiktokUx);
    // Difesa in profondità: client non auditato → solo SELF_ONLY.
    if (creatorInfo.requiresPrivatePost) {
      ux.privacyLevel = 'SELF_ONLY';
    }

    const validationError = validateTikTokPublishUxOptions(creatorInfo, ux, isVideo);
    if (validationError) {
      return { success: false, error: validationError };
    }

    if (!isVideo && !capability.canDirectPost) {
      return {
        success: false,
        error:
          "Per pubblicare foto su TikTok serve lo scope video.publish (Direct Post). Riautorizza l'account.",
      };
    }

    let externalId: string;

    if (isVideo) {
      externalId = await publishTikTokVideoPost(
        input,
        env.accessToken,
        creatorInfo,
        ux,
        capability
      );
    } else {
      externalId = await publishTikTokPhotoPost(input, env.accessToken, creatorInfo, ux);
    }

    logTikTokApiVerbal('PUBLISH_OK', {
      campaignId: input.campaignId,
      externalId,
      mode: isVideo
        ? capability.canDirectPost
          ? 'direct_video'
          : 'inbox_video'
        : 'direct_photo',
    });

    return {
      success: true,
      externalId,
      privatePost: ux.privacyLevel === 'SELF_ONLY',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const classification = classifyTikTokApiFailure({ message: msg });
    logTikTokApiVerbal('PUBLISH_CATCH', {
      campaignId: input.campaignId,
      classification,
      message: msg,
      network: isLikelyNetworkFailure(e),
    });
    const error = isLikelyNetworkFailure(e)
      ? msg.includes('Pre-flight') || msg.includes('TikTok')
        ? msg
        : formatTikTokNetworkError('publish', e)
      : isTikTokUnauditedClientError(msg)
        ? formatTikTokUnauditedClientError()
        : isTikTokScopeAuthorizationError(msg)
          ? formatTikTokScopeAuthorizationError()
          : isTikTokUrlOwnershipError(msg)
            ? formatTikTokUrlOwnershipError()
            : isTikTokGuidelinesError(msg)
              ? formatTikTokGuidelinesError(true)
              : classification === 'client_audit'
                ? formatTikTokUnauditedClientError()
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
