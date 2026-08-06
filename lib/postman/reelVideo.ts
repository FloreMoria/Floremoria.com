/**
 * Adapter POSTMAN → generatore Reel AI (Imagen + Veo).
 * Accetta foto social-ready / still campagna; genera MP4 — mai TTS.
 */
import { generateAutomaticReelVideo } from '@/lib/marketing/reel/reelGenerator';

export async function ensureCampaignReelVideoUrl(input: {
  campaignId: string;
  imageUrl: string;
  copy?: string | null;
  category?: string | null;
  deceasedName?: string | null;
  blobToken?: string;
}): Promise<string | null> {
  return generateAutomaticReelVideo({
    campaignId: input.campaignId,
    imageUrl: input.imageUrl,
    copy: input.copy,
    category: input.category,
    deceasedName: input.deceasedName,
    blobToken: input.blobToken,
  });
}
