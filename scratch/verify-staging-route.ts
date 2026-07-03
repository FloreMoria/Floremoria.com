import { createHmac } from 'node:crypto';
import { loadEnvFiles } from '@/lib/loadEnvFiles';

loadEnvFiles();
import { getBlobStoreAccess } from '@/lib/blob/storeAccess';
import {
  fetchStagedImageBytes,
  verifySocialStagingToken,
} from '@/lib/postman/socialImageStaging';
import { put } from '@vercel/blob';

const STAGING_PREFIX = 'futuria/campagne/publish-staging';

function getStagingSecret(): string {
  const secret =
    process.env.MAGIC_LINK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.POSTMAN_CRON_SECRET?.trim();
  if (!secret) throw new Error('Nessun segreto staging in env');
  return secret;
}

function createStagingToken(pathname: string, expiresAt: number): string {
  const payload = `${pathname}:${expiresAt}`;
  const sig = createHmac('sha256', getStagingSecret()).update(payload).digest('base64url');
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${payloadB64}.${sig}`;
}

async function main() {
  console.log('── Config ──');
  console.log('BLOB_STORE_ACCESS:', getBlobStoreAccess());
  console.log('BLOB_READ_WRITE_TOKEN:', process.env.BLOB_READ_WRITE_TOKEN ? 'set' : 'MISSING');
  console.log(
    'Staging secret source:',
    process.env.MAGIC_LINK_SECRET?.trim()
      ? 'MAGIC_LINK_SECRET'
      : process.env.CRON_SECRET?.trim()
        ? 'CRON_SECRET'
        : process.env.POSTMAN_CRON_SECRET?.trim()
          ? 'POSTMAN_CRON_SECRET'
          : 'NONE'
  );

  const pathname = `${STAGING_PREFIX}/verify-route-test.webp`;
  const expiresAt = Date.now() + 20 * 60 * 1000;
  const stagingToken = createStagingToken(pathname, expiresAt);

  console.log('\n── Token HMAC ──');
  console.log('pathname:', pathname);
  console.log('token length:', stagingToken.length);
  console.log('dot in token (expected 1 separator):', (stagingToken.match(/\./g) ?? []).length);

  const parsed = verifySocialStagingToken(stagingToken);
  console.log('verify roundtrip:', parsed?.pathname === pathname ? 'OK' : 'FAIL', parsed);

  const url = `https://www.floremoria.com/api/social-publish/staging/${stagingToken}`;
  const segment = new URL(url).pathname.split('/').pop()!;
  console.log('URL segment === token:', segment === stagingToken);
  console.log('verify from URL segment:', verifySocialStagingToken(segment) ? 'OK' : 'FAIL');

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken) {
    console.log('\n── Blob put/get: SKIP (no token) ──');
    return;
  }

  console.log('\n── Blob put + fetchStagedImageBytes (same as route) ──');
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  try {
    await put(pathname, tinyPng, {
      access: getBlobStoreAccess(),
      contentType: 'image/png',
      token: blobToken.replace(/[^\x20-\x7E]/g, '').trim(),
      addRandomSuffix: false,
    });
    console.log('put: OK');

    const { bytes, contentType } = await fetchStagedImageBytes(pathname, blobToken);
    console.log('fetchStagedImageBytes: OK', { bytes: bytes.length, contentType });
  } catch (e) {
    console.error('put/get FAILED:', e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
