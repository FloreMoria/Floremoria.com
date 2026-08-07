/**
 * Facade Ziggy per Command Center — Nuovo post manuale (Reel).
 * Motore: Veo (se disponibile) → Pexels Video 4K portrait → env B-roll.
 * La risposta espone sempre videoUrl MP4 + copy + hashtag + 3 slogan overlay.
 */
import { buildSocialProofCopy, type SocialProofCategoryCode } from '@/lib/marketing/socialProofCopy';
import { generateAutomaticReelVideoDetailed } from '@/lib/marketing/reel/reelGenerator';
import { buildZiggyReelSlogans } from '@/lib/marketing/reel/reelTextAudio';
import {
  resolveZiggyStockMp4,
  type ZiggyVideoSource,
} from '@/lib/media/ziggyVideoEngine';
import {
  MISSING_VEO_API_KEY_MESSAGE,
  classifyVeoError,
  resolveGeminiVeoApiKey,
  type VeoErrorKind,
} from '@/lib/media/veoClient';

/** Solo se manca qualsiasi sorgente video (caso estremo). */
export const ZIGGY_VEO_FALLBACK_NOTICE =
  'Copy e overlay pronti. Video Veo da caricare manualmente se preferisci un B-roll custom';

export type ZiggyManualReelResult = {
  videoUrl: string | null;
  videoSource: ZiggyVideoSource;
  usedFallback: boolean;
  notice: string | null;
  slogans: [string, string, string];
  sloganTimeline: Array<{ text: string; startSec: number; endSec: number }>;
  copy: string;
  hashtags: string[];
  category: SocialProofCategoryCode;
  veoErrorKind?: VeoErrorKind | null;
  veoDetail?: string | null;
};

function normalizeCategory(raw?: string | null): SocialProofCategoryCode {
  const c = String(raw || 'FT').toUpperCase();
  if (c === 'FF' || c === 'FT' || c === 'FA' || c === 'FP') return c;
  return 'FT';
}

function buildEditorialCopy(
  packCopy: string,
  slogans: [string, string, string]
): string {
  return [
    packCopy.trim(),
    '',
    '—',
    slogans[0],
    slogans[1],
    slogans[2],
  ].join('\n');
}

function buildSloganTimeline(slogans: [string, string, string]) {
  return [
    { text: slogans[0], startSec: 0.2, endSec: 4.2 },
    { text: slogans[1], startSec: 2.4, endSec: 6.4 },
    { text: slogans[2], startSec: 4.6, endSec: 8.0 },
  ];
}

function withStockVideo(
  base: Omit<ZiggyManualReelResult, 'videoUrl' | 'videoSource' | 'usedFallback' | 'notice'>,
  stock: Awaited<ReturnType<typeof resolveZiggyStockMp4>>,
  veoMeta?: { kind?: VeoErrorKind | null; detail?: string | null }
): ZiggyManualReelResult {
  if (stock) {
    // Pexels/env/local: Reel pronto — niente avviso di upload manuale.
    return {
      ...base,
      videoUrl: stock.url,
      videoSource: stock.source,
      usedFallback: true,
      notice: null,
      veoErrorKind: veoMeta?.kind ?? null,
      veoDetail: veoMeta?.detail ?? null,
    };
  }
  return {
    ...base,
    videoUrl: null,
    videoSource: 'none',
    usedFallback: true,
    notice: ZIGGY_VEO_FALLBACK_NOTICE,
    veoErrorKind: veoMeta?.kind ?? null,
    veoDetail: veoMeta?.detail ?? null,
  };
}

/** Pack editoriale + B-roll stock (Pexels) senza chiamata Veo. */
export async function buildZiggyManualEditorialPack(
  categoryRaw?: string | null,
  requestId?: string
): Promise<ZiggyManualReelResult> {
  const category = normalizeCategory(categoryRaw);
  const pack = buildSocialProofCopy(category);
  const slogans = buildZiggyReelSlogans(pack.copy);
  const seed = `ziggy-editorial-${requestId || Date.now()}`;
  const base = {
    slogans,
    sloganTimeline: buildSloganTimeline(slogans),
    copy: buildEditorialCopy(pack.copy, slogans),
    hashtags: pack.hashtags,
    category,
  };
  const stock = await resolveZiggyStockMp4({ category, seed });
  return withStockVideo(base, stock, {
    kind: 'missing_api_key',
    detail: MISSING_VEO_API_KEY_MESSAGE,
  });
}

/**
 * Genera un Reel Ziggy: prova Veo, poi Pexels 4K portrait (sempre MP4 se possibile).
 */
export async function generateZiggyManualReel(input: {
  category?: string | null;
  requestId?: string;
}): Promise<ZiggyManualReelResult> {
  const category = normalizeCategory(input.category);
  const pack = buildSocialProofCopy(category);
  const slogans = buildZiggyReelSlogans(pack.copy);
  const campaignId = `ziggy-manual-${input.requestId || Date.now()}`;
  const base = {
    slogans,
    sloganTimeline: buildSloganTimeline(slogans),
    copy: buildEditorialCopy(pack.copy, slogans),
    hashtags: pack.hashtags,
    category,
  };

  let veoErrorKind: VeoErrorKind | null = null;
  let veoDetail: string | null = null;

  if (!resolveGeminiVeoApiKey()) {
    veoErrorKind = 'missing_api_key';
    veoDetail = MISSING_VEO_API_KEY_MESSAGE;
    console.warn('[ZiggyManualReel] Chiave Veo assente → Pexels/stock B-roll.');
  } else {
    try {
      const generated = await generateAutomaticReelVideoDetailed({
        campaignId,
        copy: pack.copy,
        category,
      });

      if (generated?.source === 'veo' && generated.url) {
        return {
          ...base,
          videoUrl: generated.url,
          videoSource: 'veo',
          usedFallback: false,
          notice: null,
          veoErrorKind: null,
          veoDetail: null,
        };
      }

      // Veo non ha prodotto MP4: ignora env B-roll del reelGenerator e passa a Pexels.
      if (generated?.veoError) {
        const classified = classifyVeoError(generated.veoError);
        veoErrorKind = classified.kind;
        veoDetail = classified.detail;
      } else if (generated && generated.source !== 'veo') {
        veoErrorKind = 'unknown';
        veoDetail = `Veo non disponibile; reelGenerator ha proposto ${generated.source}`;
      }
    } catch (err) {
      const classified = classifyVeoError(err);
      veoErrorKind = classified.kind;
      veoDetail = classified.detail;
      console.warn(
        `[ZiggyManualReel] Veo fallito kind=${classified.kind} → Pexels/stock:`,
        classified.detail
      );
    }
  }

  const stock = await resolveZiggyStockMp4({ category, seed: campaignId });
  if (stock) {
    console.log(`[ZiggyManualReel] Stock B-roll source=${stock.source}`);
  } else {
    console.error(
      '[ZiggyManualReel] Nessun MP4: configura PEXELS_API_KEY o MARKETING_REEL_BROLL_URLS.'
    );
  }
  return withStockVideo(base, stock, { kind: veoErrorKind, detail: veoDetail });
}
