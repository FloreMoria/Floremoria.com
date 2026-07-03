import { createHmac, timingSafeEqual } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { getBlobStoreAccess } from '@/lib/blob/storeAccess';
import { fetchProofImageBuffer } from '@/lib/deliveryProof/blobProofStorage';
import sharp from 'sharp';

const STAGING_PREFIX = 'futuria/campagne/publish-staging';
const STAGING_TTL_MS = 20 * 60 * 1000;

function getStagingSecret(): string {
  const secret =
    process.env.MAGIC_LINK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.POSTMAN_CRON_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'Segreto staging Meta mancante (MAGIC_LINK_SECRET, CRON_SECRET o POSTMAN_CRON_SECRET).'
    );
  }
  return secret;
}

function getSiteBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERBALI_SYNC_PRODUCTION_URL?.trim() ||
    'https://www.floremoria.com';
  return base.replace(/\/$/, '');
}

function sanitizeStagingKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120);
}

function contentTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  return 'image/webp';
}

function createStagingToken(pathname: string, expiresAt: number): string {
  const payload = `${pathname}:${expiresAt}`;
  const sig = createHmac('sha256', getStagingSecret()).update(payload).digest('base64url');
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySocialStagingToken(
  token: string
): { pathname: string; expiresAt: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const sep = payload.lastIndexOf(':');
  if (sep <= 0) return null;

  const pathname = payload.slice(0, sep);
  const expiresAt = Number.parseInt(payload.slice(sep + 1), 10);
  if (!pathname || !Number.isFinite(expiresAt)) return null;

  const expected = createHmac('sha256', getStagingSecret())
    .update(`${pathname}:${expiresAt}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  if (Date.now() > expiresAt) return null;
  if (!pathname.includes(`/${STAGING_PREFIX}/`)) return null;

  return { pathname, expiresAt };
}

/**
 * Copia temporanea su Blob privato + URL pubblico firmato (HMAC) servito da /api/social-publish/staging/.
 * Meta/Instagram richiedono un URL HTTP raggiungibile: il nostro endpoint legge il Blob con token.
 * Converte SEMPRE in JPEG via Sharp per compatibilità Instagram Graph API.
 */
export async function ensureMetaFetchableImageUrl(
  campaignId: string,
  imageUrl: string,
  blobToken?: string
): Promise<string> {
  const token = blobToken?.replace(/[^\x20-\x7E]/g, '').trim();
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN mancante per esporre immagine a Meta.');
  }

  // Scarica il buffer originale
  const sourceBytes = await fetchProofImageBuffer(imageUrl);

  // Forza la conversione a JPEG progressiva con Sharp per massima compatibilità Instagram Graph API
  const jpegBytes = await sharp(sourceBytes, { failOn: 'none' })
    .rotate()
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();

  const pathname = `${STAGING_PREFIX}/${sanitizeStagingKey(campaignId)}.jpg`;

  const { putBlobWithAccessFallback } = await import('@/lib/blob/storeAccess');
  const uploadResult = await putBlobWithAccessFallback(pathname, jpegBytes, {
    contentType: 'image/jpeg',
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const expiresAt = Date.now() + STAGING_TTL_MS;
  const stagingToken = createStagingToken(uploadResult.url, expiresAt);
  const publicUrl = `${getSiteBaseUrl()}/api/social-publish/staging/${stagingToken}`;

  console.log(
    `[POSTMAN] Staging Meta (JPEG forzato) — ${pathname} → URL pubblico temporaneo (scade ${new Date(expiresAt).toISOString()})`
  );

  return publicUrl;
}

/** Legge bytes dallo staging Blob (route API). */
export async function fetchStagedImageBytes(
  absoluteUrl: string,
  blobToken: string
): Promise<{ bytes: Buffer; contentType: string }> {
  const token = blobToken.replace(/[^\x20-\x7E]/g, '').trim();
  
  const blobResult = await get(absoluteUrl, { access: getBlobStoreAccess(), token, useCache: false });
  if (!blobResult?.stream || blobResult.statusCode !== 200) {
    throw new Error(`Staging Blob non trovato (${blobResult?.statusCode ?? 'n/a'}).`);
  }

  const bytes = Buffer.from(await new Response(blobResult.stream).arrayBuffer());
  const contentType =
    blobResult.blob?.contentType?.trim() || contentTypeFromUrl(absoluteUrl);

  return { bytes, contentType };
}
