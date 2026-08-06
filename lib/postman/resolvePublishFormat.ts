import { ContentFormat } from '@prisma/client';

/** True se l’URL punta a un file video tipico (mp4/mov/webm). */
export function looksLikeVideoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('.mp4') ||
    lower.includes('.mov') ||
    lower.includes('.webm') ||
    lower.includes('video/') ||
    lower.includes('-video.')
  );
}

/**
 * Asset video grezzi da fioristi (non social-ready): non pubblicare direttamente come Reel.
 * Le foto /social-ready/ vanno bene come still di partenza per Veo.
 */
export function isRawFloristDeliveryVideoUrl(url: string | null | undefined): boolean {
  if (!url?.trim() || !looksLikeVideoUrl(url)) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('foto-consegne') ||
    lower.includes('delivery-proof') ||
    lower.includes('deliveryproof') ||
    lower.includes('/consegne/')
  );
}

/**
 * @deprecated Preferisci isRawFloristDeliveryVideoUrl. Mantenuto per compat.
 */
export function isFloristOrDeliveryMediaUrl(url: string | null | undefined): boolean {
  return isRawFloristDeliveryVideoUrl(url);
}

/**
 * Formato effettivo di pubblicazione.
 * Regola: se c’è un video, su Meta si pubblica sempre come REEL
 * (mai Story: gli endpoint Story attuali sono foto-only).
 */
export function resolveEffectiveContentFormat(input: {
  contentFormat?: ContentFormat | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
}): ContentFormat {
  const declared = input.contentFormat ?? ContentFormat.FEED_POST;
  const videoCandidate = input.videoUrl?.trim() || undefined;
  const imageAsVideo =
    looksLikeVideoUrl(input.imageUrl) && !isRawFloristDeliveryVideoUrl(input.imageUrl)
      ? input.imageUrl!.trim()
      : undefined;
  const hasVideo =
    (Boolean(videoCandidate) && !isRawFloristDeliveryVideoUrl(videoCandidate)) ||
    Boolean(imageAsVideo);

  if (hasVideo) {
    return ContentFormat.REEL;
  }

  return declared;
}

export function resolvePublishVideoUrl(input: {
  videoUrl?: string | null;
  imageUrl?: string | null;
}): string | undefined {
  const explicit = input.videoUrl?.trim();
  if (explicit) {
    if (isRawFloristDeliveryVideoUrl(explicit)) {
      console.warn(
        '[POSTMAN] Video grezzo fiorista ignorato — genera Reel AI da foto social-ready.'
      );
      return undefined;
    }
    return explicit;
  }
  if (looksLikeVideoUrl(input.imageUrl)) {
    if (isRawFloristDeliveryVideoUrl(input.imageUrl)) {
      console.warn(
        '[POSTMAN] Media video grezzo fiorista ignorato — genera Reel AI da foto social-ready.'
      );
      return undefined;
    }
    return input.imageUrl!.trim();
  }
  return undefined;
}
