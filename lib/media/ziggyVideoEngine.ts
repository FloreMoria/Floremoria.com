/**
 * Motore video Ziggy — catena affidabile per Reel Command Center.
 *
 * Priorità:
 * 1) Google Veo (se chiave Gemini configurata)
 * 2) Pexels Video API (B-roll portrait HD/4K nativo)
 * 3) Archivio env (MARKETING_REEL_BROLL_URLS / FALLBACK / TEMPLATE)
 * 4) Asset pubblico locale /marketing/reel/ziggy-quiet-luxury-fallback.mp4
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SocialProofCategoryCode } from '@/lib/marketing/socialProofCopy';
import { resolveZiggyFallbackBroll } from '@/lib/marketing/reel/brollLibrary';
import { fetchPexelsPortraitBroll } from '@/lib/media/pexelsVideoClient';

export type ZiggyVideoSource = 'veo' | 'pexels' | 'broll' | 'template' | 'local' | 'none';

export type ZiggyResolvedVideo = {
  url: string;
  source: Exclude<ZiggyVideoSource, 'none'>;
};

function resolveAppOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/^https?:\/\//, '')}`;
  }
  return 'https://www.floremoria.com';
}

/** Ultima rete: MP4 statico in /public se presente. */
export function resolveBundledZiggyFallbackUrl(): string | null {
  const rel = 'marketing/reel/ziggy-quiet-luxury-fallback.mp4';
  const disk = join(process.cwd(), 'public', rel);
  if (!existsSync(disk)) return null;
  return `${resolveAppOrigin()}/${rel}`;
}

/**
 * Risolve un MP4 B-roll affidabile (Pexels → env → locale).
 * Usato quando Veo non è disponibile o fallisce.
 */
export async function resolveZiggyStockMp4(input: {
  category: SocialProofCategoryCode;
  seed: string;
}): Promise<ZiggyResolvedVideo | null> {
  const pexels = await fetchPexelsPortraitBroll({
    category: input.category,
    seed: input.seed,
    preferBlobHost: true,
  });
  if (pexels?.url) {
    return { url: pexels.url, source: 'pexels' };
  }

  const envClip = resolveZiggyFallbackBroll(input.seed);
  if (envClip) {
    return {
      url: envClip.url,
      source: envClip.id === 'broll-template' ? 'template' : 'broll',
    };
  }

  const local = resolveBundledZiggyFallbackUrl();
  if (local) {
    return { url: local, source: 'local' };
  }

  return null;
}
