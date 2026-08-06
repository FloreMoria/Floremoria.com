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
 * Asset fioristi / prova consegna / social-ready: vietati come sorgente Reel.
 * I Reel automatici usano solo B-roll d'archivio.
 */
export function isFloristOrDeliveryMediaUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('social-ready') ||
    lower.includes('foto-consegne') ||
    lower.includes('delivery-proof') ||
    lower.includes('deliveryproof') ||
    lower.includes('/consegne/') ||
    lower.includes('proof-photo')
  );
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
    looksLikeVideoUrl(input.imageUrl) && !isFloristOrDeliveryMediaUrl(input.imageUrl)
      ? input.imageUrl!.trim()
      : undefined;
  const hasVideo =
    (Boolean(videoCandidate) && !isFloristOrDeliveryMediaUrl(videoCandidate)) ||
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
    if (isFloristOrDeliveryMediaUrl(explicit)) {
      console.warn(
        '[POSTMAN] Video fiorista/consegna ignorato per pubblicazione — solo B-roll per Reel.'
      );
      return undefined;
    }
    return explicit;
  }
  if (looksLikeVideoUrl(input.imageUrl)) {
    if (isFloristOrDeliveryMediaUrl(input.imageUrl)) {
      console.warn(
        '[POSTMAN] Media fiorista/consegna ignorato come video — solo B-roll per Reel.'
      );
      return undefined;
    }
    return input.imageUrl!.trim();
  }
  return undefined;
}
