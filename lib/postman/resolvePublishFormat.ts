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
  const hasVideo =
    Boolean(input.videoUrl?.trim()) || looksLikeVideoUrl(input.imageUrl);

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
  if (explicit) return explicit;
  if (looksLikeVideoUrl(input.imageUrl)) return input.imageUrl!.trim();
  return undefined;
}
