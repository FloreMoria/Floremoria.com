/**
 * Facade Ziggy per Command Center — Nuovo post manuale (Reel).
 * Orchestrazione: Imagen (se serve) → Veo 8s → overlay slogan → Blob.
 * Fallback elegante: B-roll archivio + copy/hashtag/slogan se Veo non disponibile.
 */
import { buildSocialProofCopy, type SocialProofCategoryCode } from '@/lib/marketing/socialProofCopy';
import { resolveZiggyFallbackBroll } from '@/lib/marketing/reel/brollLibrary';
import { generateAutomaticReelVideoDetailed } from '@/lib/marketing/reel/reelGenerator';
import { buildZiggyReelSlogans } from '@/lib/marketing/reel/reelTextAudio';
import {
  MISSING_VEO_API_KEY_MESSAGE,
  classifyVeoError,
  resolveGeminiVeoApiKey,
  type VeoErrorKind,
} from '@/lib/media/veoClient';

/** Avviso discreto quando Veo non è disponibile ma copy/overlay sono pronti. */
export const ZIGGY_VEO_FALLBACK_NOTICE =
  'Copy e overlay pronti. Video Veo da caricare manualmente se preferisci un B-roll custom';

export type ZiggyManualReelResult = {
  videoUrl: string | null;
  /** veo | broll | template | none (placeholder upload manuale). */
  videoSource: 'veo' | 'broll' | 'template' | 'none';
  usedFallback: boolean;
  notice: string | null;
  slogans: [string, string, string];
  /** Timing overlay (secondi) per preview UI. */
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

/** Pack editoriale senza chiamata Veo (rete di sicurezza API). */
export function buildZiggyManualEditorialPack(categoryRaw?: string | null): Pick<
  ZiggyManualReelResult,
  'slogans' | 'sloganTimeline' | 'copy' | 'hashtags' | 'category' | 'notice' | 'usedFallback' | 'videoSource' | 'videoUrl'
> {
  const category = normalizeCategory(categoryRaw);
  const pack = buildSocialProofCopy(category);
  const slogans = buildZiggyReelSlogans(pack.copy);
  const campaignId = `ziggy-editorial-${Date.now()}`;
  const clip = resolveZiggyFallbackBroll(campaignId);
  return {
    videoUrl: clip?.url ?? null,
    videoSource: clip ? (clip.id === 'broll-template' ? 'template' : 'broll') : 'none',
    usedFallback: true,
    notice: ZIGGY_VEO_FALLBACK_NOTICE,
    slogans,
    sloganTimeline: buildSloganTimeline(slogans),
    copy: buildEditorialCopy(pack.copy, slogans),
    hashtags: pack.hashtags,
    category,
  };
}

/**
 * Genera un Reel Ziggy (Veo) per il modal post manuale.
 * In caso di chiave/permessi/quota Veo: success soft con B-roll + copy completo.
 */
export async function generateZiggyManualReel(input: {
  category?: string | null;
  /** Seed deterministico per Blob path / B-roll pick. */
  requestId?: string;
}): Promise<ZiggyManualReelResult> {
  const category = normalizeCategory(input.category);
  const pack = buildSocialProofCopy(category);
  const slogans = buildZiggyReelSlogans(pack.copy);
  const campaignId = `ziggy-manual-${input.requestId || Date.now()}`;
  const copy = buildEditorialCopy(pack.copy, slogans);
  const sloganTimeline = buildSloganTimeline(slogans);

  let videoUrl: string | null = null;
  let videoSource: ZiggyManualReelResult['videoSource'] = 'none';
  let usedFallback = false;
  let veoErrorKind: VeoErrorKind | null = null;
  let veoDetail: string | null = null;

  if (!resolveGeminiVeoApiKey()) {
    usedFallback = true;
    veoErrorKind = 'missing_api_key';
    veoDetail = MISSING_VEO_API_KEY_MESSAGE;
    console.warn('[ZiggyManualReel] Chiave API assente → fallback B-roll/copy.');
  } else {
    try {
      const generated = await generateAutomaticReelVideoDetailed({
        campaignId,
        copy: pack.copy,
        category,
      });

      if (generated?.source === 'veo') {
        videoUrl = generated.url;
        videoSource = 'veo';
      } else if (generated) {
        videoUrl = generated.url;
        videoSource = generated.source;
        usedFallback = true;
        if (generated.veoError) {
          const classified = classifyVeoError(generated.veoError);
          veoErrorKind = classified.kind;
          veoDetail = classified.detail;
        }
      } else {
        usedFallback = true;
      }
    } catch (err) {
      const classified = classifyVeoError(err);
      usedFallback = true;
      veoErrorKind = classified.kind;
      veoDetail = classified.detail;
      console.warn(
        `[ZiggyManualReel] Veo fallito kind=${classified.kind} → fallback B-roll/copy:`,
        classified.detail
      );
    }
  }

  if (!videoUrl) {
    const clip = resolveZiggyFallbackBroll(campaignId);
    if (clip) {
      videoUrl = clip.url;
      videoSource = clip.id === 'broll-template' ? 'template' : 'broll';
      usedFallback = true;
      console.log(`[ZiggyManualReel] B-roll backup: ${clip.label}`);
    } else {
      usedFallback = true;
      videoSource = 'none';
      console.warn(
        '[ZiggyManualReel] Nessun B-roll env: copy/overlay pronti, video da upload manuale.'
      );
    }
  }

  return {
    videoUrl,
    videoSource,
    usedFallback,
    notice: usedFallback ? ZIGGY_VEO_FALLBACK_NOTICE : null,
    slogans,
    sloganTimeline,
    copy,
    hashtags: pack.hashtags,
    category,
    veoErrorKind,
    veoDetail,
  };
}
