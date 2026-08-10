/**
 * Adapter POSTMAN → generatore Reel (Veo) con fallback Pexels 4K portrait.
 * Accetta foto social-ready / still campagna; genera MP4 — mai TTS.
 */
import { coerceSocialCategoryCode } from '@/lib/marketing/socialProofCopy';
import { generateAutomaticReelVideoDetailed } from '@/lib/marketing/reel/reelGenerator';
import { resolveZiggyStockMp4 } from '@/lib/media/ziggyVideoEngine';

export type CampaignReelVideoResult = {
  url: string;
  /** veo | pexels | broll | template | local */
  source: 'veo' | 'pexels' | 'broll' | 'template' | 'local';
  usedPexelsFallback: boolean;
  notice: string | null;
};

/**
 * Garantisce un MP4 Reel per FB/IG/TikTok.
 * Veo in try/catch → fallback automatico Pexels (categoria FF/FT/FA/FP).
 */
export async function ensureCampaignReelVideo(input: {
  campaignId: string;
  imageUrl: string;
  copy?: string | null;
  category?: string | null;
  deceasedName?: string | null;
  blobToken?: string;
}): Promise<CampaignReelVideoResult | null> {
  const category = coerceSocialCategoryCode(input.category) || 'FT';

  try {
    const generated = await generateAutomaticReelVideoDetailed({
      campaignId: input.campaignId,
      imageUrl: input.imageUrl,
      copy: input.copy,
      category,
      deceasedName: input.deceasedName,
      blobToken: input.blobToken,
    });

    if (generated?.url && generated.source === 'veo') {
      return {
        url: generated.url,
        source: 'veo',
        usedPexelsFallback: false,
        notice: null,
      };
    }

    // Veo fallito ma reelGenerator ha già risolto env broll/template.
    if (generated?.url) {
      if (generated.source === 'broll' || generated.source === 'template') {
        // Preferisci comunque Pexels se disponibile (4K portrait per categoria).
        const stock = await resolveZiggyStockMp4({
          category,
          seed: input.campaignId,
        });
        if (stock?.source === 'pexels') {
          console.warn(
            `[POSTMAN] Reel: Veo non disponibile — uso Pexels 4K (categoria ${category})`
          );
          return {
            url: stock.url,
            source: 'pexels',
            usedPexelsFallback: true,
            notice:
              'Video Reel generato con fallback Pexels (Veo non disponibile). B-roll 4K verticale per categoria.',
          };
        }
      }
      return {
        url: generated.url,
        source: generated.source,
        usedPexelsFallback: false,
        notice:
          generated.source !== 'veo'
            ? 'Video Reel da archivio B-roll (Veo non disponibile).'
            : null,
      };
    }
  } catch (err) {
    console.warn(
      '[POSTMAN] Generazione Veo Reel fallita, attivo fallback Pexels:',
      err instanceof Error ? err.message : err
    );
  }

  const stock = await resolveZiggyStockMp4({
    category,
    seed: input.campaignId,
  });
  if (!stock?.url) {
    console.error(
      '[POSTMAN] Nessun Reel disponibile (Veo + Pexels + env). Configura PEXELS_API_KEY o MARKETING_REEL_BROLL_URLS.'
    );
    return null;
  }

  const usedPexels = stock.source === 'pexels';
  console.warn(
    `[POSTMAN] Reel fallback source=${stock.source} categoria=${category} campaign=${input.campaignId}`
  );
  return {
    url: stock.url,
    source: stock.source,
    usedPexelsFallback: usedPexels,
    notice: usedPexels
      ? 'Video Reel generato con fallback Pexels (Veo non disponibile). B-roll 4K verticale per categoria.'
      : `Video Reel da fallback ${stock.source} (Veo non disponibile).`,
  };
}

/** Compat: solo URL (senza metadati source). */
export async function ensureCampaignReelVideoUrl(input: {
  campaignId: string;
  imageUrl: string;
  copy?: string | null;
  category?: string | null;
  deceasedName?: string | null;
  blobToken?: string;
}): Promise<string | null> {
  const result = await ensureCampaignReelVideo(input);
  return result?.url ?? null;
}
