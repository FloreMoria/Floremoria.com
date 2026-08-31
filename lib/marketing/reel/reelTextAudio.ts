/**
 * Overlay testo slogan Ziggy su Reel ~8s.
 * Typography: Serif elegante, bianco + ombra morbida — solo catalogo approvato.
 */
import { pickApprovedReelSlogans } from '@/lib/marketing/italianCopyGuard';

export type ReelOnScreenLine = {
  text: string;
  /** Secondi di inizio (inizio fade-in) */
  startSec: number;
  /** Secondi di fine (fine fade-out) */
  endSec: number;
  /** Durata fade-in / fade-out (default 1s) */
  fadeSec?: number;
};

export const REEL_OVERLAY_DURATION_SEC = 8;
const FADE_SEC = 1;
const HOLD_SEC = 2;
/** Durata totale per slogan: fade+hold+fade = 4s */
const SLOT_SEC = FADE_SEC + HOLD_SEC + FADE_SEC;

/**
 * 3 slogan brevi per overlay — sempre dal catalogo italiano approvato (mai hook AI troncati).
 */
export function buildZiggyReelSlogans(_copy?: string | null): [string, string, string] {
  return pickApprovedReelSlogans(_copy || '');
}

/** Timeline 8s: tre slot sfalsati con fade 1 / hold 2 / fade 1. */
export function buildReelOnScreenLines(copy?: string | null): ReelOnScreenLine[] {
  const [a, b, c] = buildZiggyReelSlogans(copy);
  return [
    { text: a, startSec: 0.2, endSec: 0.2 + SLOT_SEC, fadeSec: FADE_SEC },
    { text: b, startSec: 2.4, endSec: 2.4 + SLOT_SEC, fadeSec: FADE_SEC },
    {
      text: c,
      startSec: 4.6,
      endSec: REEL_OVERLAY_DURATION_SEC,
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

/** Filtro video ffmpeg: scale/crop 9:16 + Serif bianco + ombra + fade. */
export function buildElegantTextVideoFilter(lines: ReelOnScreenLine[]): string {
  const fontFile = process.env.MARKETING_REEL_FONT_FILE?.trim();
  const fontPrefix = fontFile
    ? `fontfile='${fontFile}':`
    : `font='Georgia':`;

  const base =
    'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=saturation=0.94:brightness=0.01';

  const drawParts = lines.map((line, idx) => {
    const fade = line.fadeSec ?? FADE_SEC;
    const y = idx === 2 ? 'h*0.78' : idx === 1 ? 'h*0.70' : 'h*0.62';
    const fontsize = idx === 2 ? 56 : idx === 0 ? 44 : 40;
    const alpha = buildFadeAlphaExpr(line.startSec, line.endSec, fade);
    return (
      `drawtext=${fontPrefix}` +
      `text='${escapeDrawtext(line.text)}':` +
      `fontsize=${fontsize}:fontcolor=white:` +
      `borderw=0:` +
      `shadowx=2:shadowy=2:shadowcolor=black@0.45:` +
      `alpha='${alpha}':` +
      `x=(w-text_w)/2:y=${y}`
    );
  });

  return [base, ...drawParts].join(',');
}
