/**
 * Adapter compatibilità POSTMAN → generatore Reel standard B-roll.
 * NON usa più l'immagine campagna / foto fioristi come sorgente visiva.
 */
import { generateAutomaticReelVideo } from '@/lib/marketing/reel/reelGenerator';

/**
 * @deprecated Preferisci generateAutomaticReelVideo.
 * Mantenuto per socialPublish: imageUrl è ignorato (solo B-roll archivio).
 */
export async function ensureCampaignReelVideoUrl(input: {
  campaignId: string;
  imageUrl: string;
  copy?: string | null;
  blobToken?: string;
}): Promise<string | null> {
  return generateAutomaticReelVideo({
    campaignId: input.campaignId,
    imageUrl: input.imageUrl,
    copy: input.copy,
    blobToken: input.blobToken,
  });
}
