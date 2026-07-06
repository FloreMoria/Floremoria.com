import { ContentFormat } from '@prisma/client';
import { formatCampaignCaption } from '@/lib/postman/socialPublish';

/** Copy breve per story che rimanda a post/reel del giorno. */
export function buildStoryCaption(copy: string, hashtags: string[]): string {
  const base = formatCampaignCaption(copy, hashtags);
  const promo =
    '\n\n✨ Scopri il post di oggi sul nostro profilo — e, quando disponibile, il reel in evidenza.';
  const trimmed = base.trim();
  if (trimmed.length + promo.length <= 2200) {
    return `${trimmed}${promo}`;
  }
  return trimmed.slice(0, 2180).trimEnd() + '…' + promo;
}

export function buildReelCaption(copy: string, hashtags: string[]): string {
  const base = formatCampaignCaption(copy, hashtags);
  const promo = '\n\n🎬 Reel FloreMoria — seguici per ricordi fatti con cura ogni giorno.';
  const trimmed = base.trim();
  if (trimmed.length + promo.length <= 2200) {
    return `${trimmed}${promo}`;
  }
  return trimmed.slice(0, 2180).trimEnd() + '…' + promo;
}

export function captionForFormat(
  contentFormat: ContentFormat,
  copy: string,
  hashtags: string[]
): string {
  if (contentFormat === ContentFormat.STORY) {
    return buildStoryCaption(copy, hashtags);
  }
  if (contentFormat === ContentFormat.REEL) {
    return buildReelCaption(copy, hashtags);
  }
  return formatCampaignCaption(copy, hashtags);
}
