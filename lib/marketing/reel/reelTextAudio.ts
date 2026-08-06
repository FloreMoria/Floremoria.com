/**
 * Overlay testo e audio per Reel FloreMoria.
 * - Typography pulita / elegante, slogan brevi a comparsa ritmica
 * - Nessun TTS / voiceover sintetico: solo musica strumentale d'ambiente
 */

export type ReelOnScreenLine = {
  text: string;
  /** Secondi di inizio comparsa */
  startSec: number;
  /** Secondi di fine */
  endSec: number;
};

const MAX_LINE_CHARS = 42;

/** Slogan/CTA brevi derivati dal copy campagna (mai anagrafica / mai TTS). */
export function buildReelOnScreenLines(copy?: string | null): ReelOnScreenLine[] {
  const cleaned = String(copy || '')
    .replace(/#[\wàèéìòù]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const firstSentence =
    cleaned
      .split(/[.!?\n]/)
      .map((s) => s.trim())
      .find((s) => s.length >= 12) || 'Un gesto di presenza, anche da lontano.';

  const line1 = truncateSlogan(firstSentence, MAX_LINE_CHARS);
  const line2 = 'FloreMoria · fiori sulla tomba';
  const line3 = 'www.floremoria.com';

  return [
    { text: line1, startSec: 1.2, endSec: 5.5 },
    { text: line2, startSec: 6.0, endSec: 10.5 },
    { text: line3, startSec: 11.0, endSec: 14.5 },
  ];
}

function truncateSlogan(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 18 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Escape per drawtext ffmpeg. */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

/**
 * Filtro video ffmpeg: scale/crop 9:16 + testo elegante a comparsa ritmica.
 * Font: MARKETING_REEL_FONT_FILE se impostato, altrimenti font di sistema generico.
 */
export function buildElegantTextVideoFilter(lines: ReelOnScreenLine[]): string {
  const fontFile = process.env.MARKETING_REEL_FONT_FILE?.trim();
  const fontPrefix = fontFile
    ? `fontfile='${fontFile}':`
    : `font='Georgia':`;

  const base =
    'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=saturation=0.92:brightness=0.02';

  const drawParts = lines.map((line, idx) => {
    const y = idx === 0 ? 'h*0.62' : idx === 1 ? 'h*0.72' : 'h*0.82';
    const fontsize = idx === 0 ? 48 : 36;
    const enable = `between(t\\,${line.startSec}\\,${line.endSec})`;
    return (
      `drawtext=${fontPrefix}` +
      `text='${escapeDrawtext(line.text)}':` +
      `fontsize=${fontsize}:fontcolor=white@0.92:` +
      `borderw=2:bordercolor=black@0.35:` +
      `x=(w-text_w)/2:y=${y}:` +
      `enable='${enable}'`
    );
  });

  return [base, ...drawParts].join(',');
}
