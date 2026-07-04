import { createHmac, timingSafeEqual } from 'node:crypto';
import { get } from '@vercel/blob';
import { getBlobStoreAccess } from '@/lib/blob/storeAccess';
import { fetchProofImageBuffer } from '@/lib/deliveryProof/blobProofStorage';
import sharp from 'sharp';

const STAGING_PREFIX = 'futuria/campagne/publish-staging';
const STAGING_TTL_MS = 20 * 60 * 1000;

/** Segreti candidati per firma/verifica HMAC (ordine: condiviso → env noti). */
function getStagingSecretCandidates(): string[] {
  const raw = [
    process.env.SOCIAL_STAGING_SHARED_SECRET,
    process.env.MAGIC_LINK_SECRET,
    process.env.CRON_SECRET,
    process.env.POSTMAN_CRON_SECRET,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const secret = value?.trim();
    if (!secret || seen.has(secret)) continue;
    seen.add(secret);
    out.push(secret);
  }
  return out;
}

function getStagingSecret(): string {
  const candidates = getStagingSecretCandidates();
  if (candidates.length === 0) {
    throw new Error(
      'Segreto staging Meta mancante (SOCIAL_STAGING_SHARED_SECRET, MAGIC_LINK_SECRET, CRON_SECRET o POSTMAN_CRON_SECRET).'
    );
  }
  return candidates[0]!;
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

function signStagingPayload(pathname: string, expiresAt: number, secret: string): string {
  const payload = `${pathname}:${expiresAt}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${payloadB64}.${sig}`;
}

function createStagingToken(pathname: string, expiresAt: number): string {
  return signStagingPayload(pathname, expiresAt, getStagingSecret());
}

function hmacMatches(pathname: string, expiresAt: number, sig: string, secret: string): boolean {
  const expected = createHmac('sha256', secret)
    .update(`${pathname}:${expiresAt}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
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
  if (Date.now() > expiresAt) return null;
  if (!pathname.includes(STAGING_PREFIX)) return null;

  // TEMP: bypass HMAC se Mac/Vercel hanno segreti disallineati (rimuovere dopo allineamento env).
  if (process.env.SOCIAL_STAGING_VERIFY_BYPASS === 'true') {
    return { pathname, expiresAt };
  }

  for (const secret of getStagingSecretCandidates()) {
    if (hmacMatches(pathname, expiresAt, sig, secret)) {
      return { pathname, expiresAt };
    }
  }

  return null;
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

  const sourceBytes = await fetchProofImageBuffer(imageUrl);

  const jpegBytes = await sharp(sourceBytes, { failOn: 'none' })
    .rotate()
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();

  const pathname = `${STAGING_PREFIX}/${sanitizeStagingKey(campaignId)}.jpg`;

  const { putBlobWithAccessFallback } = await import('@/lib/blob/storeAccess');
  await putBlobWithAccessFallback(pathname, jpegBytes, {
    contentType: 'image/jpeg',
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const expiresAt = Date.now() + STAGING_TTL_MS;
  const stagingToken = createStagingToken(pathname, expiresAt);
  const publicUrl = `${getSiteBaseUrl()}/api/social-publish/staging/${stagingToken}`;

  console.log(
    `[POSTMAN] Staging Meta (JPEG forzato) — ${pathname} → URL pubblico temporaneo (scade ${new Date(expiresAt).toISOString()})`
  );

  return publicUrl;
}

/** Legge bytes dallo staging Blob (route API). */
export async function fetchStagedImageBytes(
  pathname: string,
  blobToken: string
): Promise<{ bytes: Buffer; contentType: string }> {
  const token = blobToken.replace(/[^\x20-\x7E]/g, '').trim();

  const blobResult = await get(pathname, { access: getBlobStoreAccess(), token, useCache: false });
  if (!blobResult?.stream || blobResult.statusCode !== 200) {
    throw new Error(`Staging Blob non trovato (${blobResult?.statusCode ?? 'n/a'}).`);
  }

  const bytes = Buffer.from(await new Response(blobResult.stream).arrayBuffer());
  const contentType =
    blobResult.blob?.contentType?.trim() || contentTypeFromUrl(pathname);

  return { bytes, contentType };
}
