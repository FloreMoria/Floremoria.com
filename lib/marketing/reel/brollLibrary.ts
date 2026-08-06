/**
 * Libreria B-roll 4K per Reel automatici FloreMoria.
 * Sorgente visiva ESCLUSIVA: archivio estetico (cimiteri monumentali, marmo,
 * fiori in luce naturale, viali al tramonto). Mai foto/video fioristi.
 *
 * Configura via env (URL pubblici https, preferibilmente 9:16 o croppabili):
 *   MARKETING_REEL_BROLL_URLS=url1,url2,url3
 * Fallback singolo: MARKETING_REEL_FALLBACK_VIDEO_URL (deve essere B-roll, non consegna).
 */

export type BrollClip = {
  id: string;
  url: string;
  mood: 'monumentale' | 'natura' | 'tramonto' | 'dettaglio';
  label: string;
};

function parseUrlList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
}

/** Clips da env (priorità). */
export function loadConfiguredBrollClips(): BrollClip[] {
  const urls = parseUrlList(process.env.MARKETING_REEL_BROLL_URLS);
  const fallback = process.env.MARKETING_REEL_FALLBACK_VIDEO_URL?.trim();
  if (fallback && /^https?:\/\//i.test(fallback) && !urls.includes(fallback)) {
    urls.push(fallback);
  }

  return urls.map((url, i) => ({
    id: `broll-env-${i + 1}`,
    url,
    mood: (['monumentale', 'natura', 'tramonto', 'dettaglio'] as const)[i % 4]!,
    label: `Archivio B-roll ${i + 1}`,
  }));
}

/** Seleziona un clip B-roll in modo deterministico per campagna (riproducibile). */
export function pickBrollClip(campaignId: string, clips: BrollClip[]): BrollClip | null {
  if (!clips.length) return null;
  let hash = 0;
  for (let i = 0; i < campaignId.length; i++) {
    hash = (hash * 31 + campaignId.charCodeAt(i)) >>> 0;
  }
  return clips[hash % clips.length]!;
}

/**
 * Traccia musicale strumentale/ambiente (mai TTS / voce sintetica).
 * MARKETING_REEL_MUSIC_URL = https://...mp3|m4a|wav
 */
export function resolveInstrumentalMusicUrl(): string | null {
  const url = process.env.MARKETING_REEL_MUSIC_URL?.trim();
  if (url && /^https?:\/\//i.test(url)) return url;
  return null;
}
