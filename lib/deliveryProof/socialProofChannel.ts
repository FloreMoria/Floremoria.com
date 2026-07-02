import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { fetchProofImageBuffer, sanitizeAsciiUrl } from '@/lib/deliveryProof/blobProofStorage';
import { sanitizeDeliveryPhotoForSocial } from '@/lib/deliveryProof/socialSanitizer';
import { DELIVERY_PROOF_SOCIAL_READY_PREFIX } from '@/lib/deliveryProof/storagePaths';
import {
  buildSocialProofCopy,
  resolveSocialCategoryFromProductSlugs,
  type SocialProofCategoryCode,
} from '@/lib/futuria/socialProofCopy';

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error('[social-proof] BLOB_READ_WRITE_TOKEN mancante.');
  }
  return token.replace(/[^\x20-\x7E]/g, '').trim();
}

export interface SanitizeProofPhotoInput {
  orderId: string;
  deliveryProofId: string;
  /** URL foto originale (canale privato) — non viene mai sovrascritta. */
  sourcePhotoUrl: string;
  slot: 'after' | 'before';
  index?: number;
  socialCategory?: SocialProofCategoryCode;
}

export interface SanitizeProofPhotoResult {
  socialReadyUrl: string;
  socialCategory: SocialProofCategoryCode;
  copy: string;
  hashtags: string[];
}

/**
 * Copia temporanea → sanificazione Sharp → upload su /social-ready/ (canale a senso unico).
 */
export async function sanitizeAndUploadSocialReadyProof(
  input: SanitizeProofPhotoInput
): Promise<SanitizeProofPhotoResult> {
  const { orderId, deliveryProofId, sourcePhotoUrl, slot, index = 0 } = input;

  console.log(
    `[Social Proof] Sanificazione avviata - ordine ${orderId}, slot ${slot}[${index}] (proof ${deliveryProofId})`
  );

  const sourceBuffer = await fetchProofImageBuffer(sanitizeAsciiUrl(sourcePhotoUrl));
  const sanitizedBuffer = await sanitizeDeliveryPhotoForSocial(sourceBuffer);

  let socialCategory = input.socialCategory;
  if (!socialCategory) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { items: { select: { product: { select: { category: { select: { slug: true } } } } } } },
    });
    const slugs = order?.items.map((i) => i.product.category?.slug) ?? [];
    socialCategory = resolveSocialCategoryFromProductSlugs(slugs);
  }

  const copyPack = buildSocialProofCopy(socialCategory);
  const token = getBlobToken();
  const blobPath = `${DELIVERY_PROOF_SOCIAL_READY_PREFIX}/${orderId}/${slot}-${index}-${randomUUID()}.webp`;

  const { url: socialReadyUrl } = await put(blobPath, sanitizedBuffer, {
    access: 'private',
    contentType: 'image/webp',
    token,
    addRandomSuffix: false,
  });

  console.log(
    `[Social Proof] Upload social-ready completato - ${socialReadyUrl} (categoria ${socialCategory})`
  );

  return {
    socialReadyUrl,
    socialCategory,
    copy: copyPack.copy,
    hashtags: copyPack.hashtags,
  };
}

export interface SyncSocialProofForOrderInput {
  orderId: string;
  deliveryProofId: string;
  afterPhotoUrls: string[];
  socialCategory?: SocialProofCategoryCode;
}

/**
 * Genera versioni social-ready dalle foto "Dopo" (canale privato intatto).
 * Aggiorna DeliveryProof con URL sanificati e copy standardizzato.
 */
export async function syncSocialReadyProofsForOrder(
  input: SyncSocialProofForOrderInput
): Promise<{ socialReadyAfterUrls: string[]; socialReadyPrimaryUrl: string | null }> {
  const { orderId, deliveryProofId, afterPhotoUrls } = input;

  if (!afterPhotoUrls.length) {
    console.warn(`[Social Proof] Nessuna foto "Dopo" per ordine ${orderId} - skip sanificazione.`);
    return { socialReadyAfterUrls: [], socialReadyPrimaryUrl: null };
  }

  const socialReadyAfterUrls: string[] = [];
  let socialCategory: SocialProofCategoryCode | undefined = input.socialCategory;

  for (let i = 0; i < afterPhotoUrls.length; i += 1) {
    const sourceUrl = afterPhotoUrls[i]!;
    try {
      const result = await sanitizeAndUploadSocialReadyProof({
        orderId,
        deliveryProofId,
        sourcePhotoUrl: sourceUrl,
        slot: 'after',
        index: i,
        socialCategory,
      });
      socialReadyAfterUrls.push(result.socialReadyUrl);
      socialCategory = result.socialCategory;
    } catch (err) {
      console.error(
        `[Social Proof] Errore sanificazione foto after[${i}] ordine ${orderId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const socialReadyPrimaryUrl = socialReadyAfterUrls[0] ?? null;
  const copyPack = buildSocialProofCopy(socialCategory ?? 'FP');

  await prisma.deliveryProof.update({
    where: { id: deliveryProofId },
    data: {
      socialReadyAfterUrls,
      socialReadyPrimaryUrl,
      socialCopyCategory: copyPack.category,
      socialSanitizedAt: socialReadyAfterUrls.length ? new Date() : undefined,
    },
  });

  console.log(
    `[Social Proof] Proof ${deliveryProofId} aggiornato - ${socialReadyAfterUrls.length} asset social-ready`
  );

  return { socialReadyAfterUrls, socialReadyPrimaryUrl };
}

/** Asset social pronti per Futuria/POSTMAN — rifiuta URL non sanificati. */
export function assertSocialReadyAssetUrl(imageUrl: string): void {
  if (!imageUrl.includes('social-ready')) {
    throw new Error(
      'Pubblicazione social bloccata: consentiti solo asset dal canale /social-ready/.'
    );
  }
}

export async function uploadSanitizedBufferToSocialReady(
  sanitizedBuffer: Buffer,
  orderId: string,
  slot: 'after' | 'before',
  index: number
): Promise<string> {
  const token = getBlobToken();
  const blobPath = `${DELIVERY_PROOF_SOCIAL_READY_PREFIX}/${orderId}/${slot}-${index}-${randomUUID()}.webp`;

  const { url } = await put(blobPath, sanitizedBuffer, {
    access: 'private',
    contentType: 'image/webp',
    token,
    addRandomSuffix: false,
  });

  return url;
}

/** Sandbox / test: sanifica un buffer sorgente e carica su /social-ready/ (senza toccare il privato). */
export async function sandboxSanitizeSourceToSocialReady(input: {
  sourceBuffer: Buffer;
  orderId?: string;
  socialCategory?: SocialProofCategoryCode;
}): Promise<SanitizeProofPhotoResult> {
  const orderId = input.orderId?.trim() || `sandbox-${Date.now()}`;
  const sanitizedBuffer = await sanitizeDeliveryPhotoForSocial(input.sourceBuffer);
  const socialReadyUrl = await uploadSanitizedBufferToSocialReady(
    sanitizedBuffer,
    orderId,
    'after',
    0
  );
  const socialCategory = input.socialCategory ?? 'FT';
  const copyPack = buildSocialProofCopy(socialCategory);

  return {
    socialReadyUrl,
    socialCategory,
    copy: copyPack.copy,
    hashtags: copyPack.hashtags,
  };
}
