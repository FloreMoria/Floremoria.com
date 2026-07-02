/**
 * Sandbox - test sanificazione privacy foto consegna -> canale /social-ready/
 *
 * Uso (file locale):
 *   SANDBOX_LOCAL_FILE=./foto-test.jpg SANDBOX_CATEGORY=FT npx tsx scratch/sandbox-social-sanitize.ts
 *
 * Uso (URL Blob privato o pubblico):
 *   SANDBOX_BLOB_URL="https://..." SANDBOX_CATEGORY=FT npx tsx scratch/sandbox-social-sanitize.ts
 *
 * Uso (DeliveryProof esistente - ri-sanifica prima foto "Dopo"):
 *   SANDBOX_ORDER_ID=<orderId> npx tsx scratch/sandbox-social-sanitize.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import {
  fetchProofImageBuffer,
  sanitizeAsciiUrl,
} from '../lib/deliveryProof/blobProofStorage';
import { sandboxSanitizeSourceToSocialReady } from '../lib/deliveryProof/socialProofChannel';
import {
  coerceSocialCategoryCode,
  type SocialProofCategoryCode,
} from '../lib/futuria/socialProofCopy';
import prisma from '../lib/prisma';

loadEnvFiles();

function cleanEnvValue(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .trim()
    .split(/[\s\u2013\u2014\u2026]/)[0]!
    .replace(/[^\x20-\x7E]/g, '');
}

async function loadSourceBuffer(): Promise<{ buffer: Buffer; orderId: string; category: SocialProofCategoryCode }> {
  const orderIdFromEnv = cleanEnvValue(process.env.SANDBOX_ORDER_ID);
  const localFile = cleanEnvValue(process.env.SANDBOX_LOCAL_FILE);
  const blobUrl = cleanEnvValue(process.env.SANDBOX_BLOB_URL);
  const category = coerceSocialCategoryCode(cleanEnvValue(process.env.SANDBOX_CATEGORY) || 'FT');

  if (orderIdFromEnv) {
    const proof = await prisma.deliveryProof.findUnique({
      where: { orderId: orderIdFromEnv },
      select: {
        orderId: true,
        photoAfterUrl: true,
        photosAfterUrls: true,
        socialCopyCategory: true,
      },
    });

    if (!proof) {
      throw new Error(`DeliveryProof non trovato per ordine ${orderIdFromEnv}`);
    }

    const sourceUrl = proof.photosAfterUrls[0] || proof.photoAfterUrl;
    if (!sourceUrl) {
      throw new Error(`Nessuna foto "Dopo" per ordine ${orderIdFromEnv}`);
    }

    const safeUrl = sanitizeAsciiUrl(sourceUrl);
    console.log(`-> Sorgente: foto consegna privata (${safeUrl.slice(0, 80)}...)`);
    const buffer = await fetchProofImageBuffer(safeUrl);
    return {
      buffer,
      orderId: proof.orderId,
      category: coerceSocialCategoryCode(proof.socialCopyCategory || category),
    };
  }

  if (localFile) {
    const path = resolve(process.cwd(), localFile);
    if (!existsSync(path)) {
      throw new Error(`File locale non trovato: ${path}`);
    }
    console.log(`-> Sorgente: file locale ${path}`);
    return {
      buffer: readFileSync(path),
      orderId: orderIdFromEnv || `sandbox-local-${Date.now()}`,
      category,
    };
  }

  if (blobUrl) {
    const safeUrl = sanitizeAsciiUrl(blobUrl);
    console.log(`-> Sorgente: URL Blob ${safeUrl.slice(0, 80)}...`);
    const buffer = await fetchProofImageBuffer(safeUrl);
    return {
      buffer,
      orderId: orderIdFromEnv || `sandbox-blob-${Date.now()}`,
      category,
    };
  }

  throw new Error(
    'Imposta SANDBOX_LOCAL_FILE, SANDBOX_BLOB_URL oppure SANDBOX_ORDER_ID in .env.local o nella shell.'
  );
}

async function main() {
  console.log('Sandbox - sanificazione privacy (canale social-ready)\n');

  const { buffer, orderId, category } = await loadSourceBuffer();

  console.log(`   Ordine/path logico: ${orderId}`);
  console.log(`   Categoria copy: ${category}`);
  console.log('\n-> Sanificazione Sharp (crop + blur + strip EXIF)...\n');

  const startedAt = Date.now();
  const result = await sandboxSanitizeSourceToSocialReady({
    sourceBuffer: buffer,
    orderId,
    socialCategory: category,
  });
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('=======================================');
  console.log(`Completato in ${elapsedSec}s\n`);
  console.log(`URL /social-ready/:\n${result.socialReadyUrl}\n`);
  console.log(`Categoria: ${result.socialCategory}`);
  console.log(`Hashtag: ${result.hashtags.map((t) => `#${t}`).join(' ')}\n`);
  console.log('Copy standard (nessun dato ordine):\n');
  console.log(result.copy);
  console.log('\n=======================================');
  console.log('\nLa foto originale (canale privato) non e stata modificata.');
}

main()
  .catch((err) => {
    console.error('Errore sandbox social-sanitize:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
