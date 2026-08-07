/**
 * Facade Ziggy per Command Center — Nuovo post manuale (Reel).
 * Orchestrazione: Imagen (se serve) → Veo 8s → overlay slogan → Blob.
 */
import { buildSocialProofCopy, type SocialProofCategoryCode } from '@/lib/marketing/socialProofCopy';
import { generateAutomaticReelVideo } from '@/lib/marketing/reel/reelGenerator';
import { buildZiggyReelSlogans } from '@/lib/marketing/reel/reelTextAudio';

export type ZiggyManualReelResult = {
  videoUrl: string;
  slogans: [string, string, string];
  /** Timing overlay (secondi) per preview UI. */
  sloganTimeline: Array<{ text: string; startSec: number; endSec: number }>;
  copy: string;
  hashtags: string[];
  category: SocialProofCategoryCode;
};

function normalizeCategory(raw?: string | null): SocialProofCategoryCode {
  const c = String(raw || 'FT').toUpperCase();
  if (c === 'FF' || c === 'FT' || c === 'FA' || c === 'FP') return c;
  return 'FT';
}

/**
 * Genera un Reel Ziggy (Veo) per il modal post manuale.
 * @param category — FF/FT/FA/FP (passa al prompt Imagen e al pack copy/hashtag)
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

  const videoUrl = await generateAutomaticReelVideo({
    campaignId,
    copy: pack.copy,
    category,
  });

  if (!videoUrl) {
    throw new Error(
      "Ziggy non ha potuto generare il Reel. Verifica chiave API (GEMINI_API_KEY / GOOGLE_AI_STUDIO_API_KEY / GOOGLE_API_KEY) e abilitazione Veo sul progetto Google."
    );
  }

  // Copy post: pack categoria + tre slogan come preview editoriale.
  const copy = [
    pack.copy.trim(),
    '',
    '—',
    slogans[0],
    slogans[1],
    slogans[2],
  ].join('\n');

  return {
    videoUrl,
    slogans,
    sloganTimeline: [
      { text: slogans[0], startSec: 0.2, endSec: 4.2 },
      { text: slogans[1], startSec: 2.4, endSec: 6.4 },
      { text: slogans[2], startSec: 4.6, endSec: 8.0 },
    ],
    copy,
    hashtags: pack.hashtags,
    category,
  };
}
