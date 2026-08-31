/**
 * Overlay testo slogan Ziggy su Micro-Video 2-3s a loop continuo.
 * Typography: Serif elegante, bianco + ombra morbida — solo catalogo approvato da italianCopyGuard.ts.
 */
import { pickApprovedReelSlogans, pickApprovedSlogan } from '@/lib/marketing/italianCopyGuard';
import { STANDARD_SCENE_DURATION_SEC } from '@/lib/marketing/reel/reelDirection';

export type ReelOnScreenLine = {
  text: string;
  /** Secondi di inizio (inizio fade-in) */
  startSec: number;
  /** Secondi di fine (fine fade-out) */
  endSec: number;
  /** Durata fade-in / fade-out (default 0.35s) */
  fadeSec?: number;
};

/** Durata standard del micro-clip a loop: 2.5 secondi (target 2.0–3.0s). */
export const REEL_OVERLAY_DURATION_SEC = STANDARD_SCENE_DURATION_SEC;
const FADE_SEC = 0.35;
const HOLD_SEC = 1.8;

/**
 * 3 slogan brevi per catalogo / fallback.
 */
export function buildZiggyReelSlogans(_copy?: string | null): [string, string, string] {
  return pickApprovedReelSlogans(_copy || '');
}

/**
 * Timeline 2.5s per micro-clip a loop: 1 slogan principale ad alto impatto con fade-in / hold / fade-out morbido.
 */
export function buildReelOnScreenLines(copy?: string | null): ReelOnScreenLine[] {
  const primarySlogan = pickApprovedSlogan(copy || '');
  return [
    {
      text: primarySlogan,
      startSec: 0.15,
      endSec: REEL_OVERLAY_DURATION_SEC - 0.15,
      fadeSec: FADE_SEC,
    },
  ];
}

/** Escape per drawtext ffmpeg. */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

/**
 * Espressione alpha ffmpeg: fade-in → hold → fade-out.
 */
export function buildFadeAlphaExpr(
  startSec: number,
  endSec: number,
  fadeSec = FADE_SEC
): string {
  const fadeInEnd = startSec + fadeSec;
  const fadeOutStart = Math.max(startSec + fadeSec, endSec - fadeSec);
  return (
    `if(lt(t\\,${startSec.toFixed(2)})\\,0\\,` +
    `if(lt(t\\,${fadeInEnd.toFixed(2)})\\,(t-${startSec.toFixed(2)})/${fadeSec}\\,` +
    `if(lt(t\\,${fadeOutStart.toFixed(2)})\\,1\\,` +
    `if(lt(t\\,${endSec.toFixed(2)})\\,(${endSec.toFixed(2)}-t)/${fadeSec}\\,0))))`
  );
}

/**
 * Filtro video ffmpeg:
 * - Scale & crop verticale 9:16 (1080x1920) per IG/TikTok/FB Reels
 * - Dissolvenza morbida di loop (0.35s) per chiusura continua senza scatti
 * - Serif bianco + ombra morbida per lo slogan approvato
 */
export function buildElegantTextVideoFilter(
  lines: ReelOnScreenLine[],
  durationSec = REEL_OVERLAY_DURATION_SEC
): string {
  const fontFile = process.env.MARKETING_REEL_FONT_FILE?.trim();
  const fontPrefix = fontFile
    ? `fontfile='${fontFile}':`
    : `font='Georgia':`;

  const fadeOutStart = Math.max(0, durationSec - FADE_SEC);
  const base = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920',
    'eq=saturation=0.94:brightness=0.01',
    `fade=t=in:st=0:d=${FADE_SEC}`,
    `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${FADE_SEC}`,
  ].join(',');

  const drawParts = lines.map((line) => {
    const fade = line.fadeSec ?? FADE_SEC;
    const y = 'h*0.74';
    const fontsize = 52;
    const alpha = buildFadeAlphaExpr(line.startSec, line.endSec, fade);
    return (
      `drawtext=${fontPrefix}` +
      `text='${escapeDrawtext(line.text)}':` +
      `fontsize=${fontsize}:fontcolor=white:` +
      `borderw=0:` +
      `shadowx=2:shadowy=2:shadowcolor=black@0.55:` +
      `alpha='${alpha}':` +
      `x=(w-text_w)/2:y=${y}`
    );
  });

  return [base, ...drawParts].join(',');
}
