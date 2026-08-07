/**
 * Pexels Video API — B-roll verticale HD/4K per Reel Ziggy.
 * Query allineate alla regia Quiet Luxury (macro fiori, marmo, golden hour, no people).
 *
 * Env: PEXELS_API_KEY (o PEXELS_API_TOKEN)
 */
import { put } from '@vercel/blob';
import type { SocialProofCategoryCode } from '@/lib/marketing/socialProofCopy';

const PEXELS_SEARCH = 'https://api.pexels.com/v1/videos/search';
const REEL_VIDEO_PREFIX = 'marketing/campagne/reel-videos';

export type PexelsBrollResult = {
  /** URL MP4 riproducibile (Blob pubblico se possibile, altrimenti CDN Pexels). */
  url: string;
  sourceUrl: string;
  query: string;
  videoId: number;
  width: number;
  height: number;
  hostedOnBlob: boolean;
};

type PexelsVideoFile = {
  id: number;
  quality: string;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
  fps?: number;
};

type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  duration: number;
  video_files: PexelsVideoFile[];
};

/** Query portrait Quiet Luxury per categoria Command Center. */
export const PEXELS_QUERIES_BY_CATEGORY: Record<SocialProofCategoryCode, string[]> = {
  FT: [
    'white roses macro close up',
    'cemetery marble sunset',
    'peaceful flowers golden hour',
    'marble flowers soft light',
  ],
  FF: [
    'white funeral flowers bouquet',
    'white lilies soft light memorial',
    'peaceful flowers golden hour',
    'white roses marble stone',
  ],
  FA: [
    'white roses macro close up',
    'peaceful flowers golden hour',
    'small wildflowers soft bokeh',
    'daisy flowers soft light',
  ],
  FP: [
    'green plant leaves macro',
    'olive branch soft light',
    'botanical leaves golden hour',
    'potted plant marble surface',
  ],
};

export function resolvePexelsApiKey(): string | null {
  return (
    process.env.PEXELS_API_KEY?.trim() ||
    process.env.PEXELS_API_TOKEN?.trim() ||
    null
  );
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickQuery(category: SocialProofCategoryCode, seed: string): string {
  const list = PEXELS_QUERIES_BY_CATEGORY[category] || PEXELS_QUERIES_BY_CATEGORY.FT;
  return list[hashSeed(seed) % list.length]!;
}

/** Preferisce portrait MP4 4K/HD (non HLS), file più grandi prima. */
export function selectBestPortraitMp4(
  video: PexelsVideo
): { link: string; width: number; height: number; quality: string } | null {
  const files = (video.video_files || []).filter(
    (f) =>
      f.link &&
      f.file_type === 'video/mp4' &&
      f.quality !== 'hls' &&
      typeof f.width === 'number' &&
      typeof f.height === 'number' &&
      f.width > 0 &&
      f.height > 0
  );
  if (!files.length) return null;

  const scored = files
    .map((f) => {
      const w = f.width!;
      const h = f.height!;
      const portrait = h >= w ? 1 : 0;
      const pixels = w * h;
      const qualityBonus =
        f.quality === 'uhd' ? 3 : f.quality === 'hd' ? 2 : f.quality === 'sd' ? 0 : 1;
      const pexelsCdn = /videos\.pexels\.com/i.test(f.link) ? 1 : 0;
      return {
        link: f.link,
        width: w,
        height: h,
        quality: f.quality,
        score: portrait * 1_000_000_000 + qualityBonus * 10_000_000 + pexelsCdn * 1_000_000 + pixels,
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  return {
    link: best.link,
    width: best.width,
    height: best.height,
    quality: best.quality,
  };
}

async function searchPexelsPortrait(
  query: string,
  apiKey: string
): Promise<PexelsVideo[]> {
  const trySearch = async (size: 'large' | 'medium' | 'small') => {
    const url = new URL(PEXELS_SEARCH);
    url.searchParams.set('query', query);
    url.searchParams.set('orientation', 'portrait');
    url.searchParams.set('size', size);
    url.searchParams.set('per_page', '15');

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Pexels search ${res.status}${body ? `: ${body.slice(0, 240)}` : ''}`
      );
    }
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    return data.videos || [];
  };

  // large = 4K preferito; se vuoto, degrada a Full HD / HD.
  for (const size of ['large', 'medium', 'small'] as const) {
    const videos = await trySearch(size);
    if (videos.length) return videos;
  }
  return [];
}

async function hostMp4OnBlob(
  sourceUrl: string,
  campaignId: string
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;

  const res = await fetch(sourceUrl, {
    headers: {
      // Alcuni CDN Pexels/Vimeo sono più permissivi con UA browser.
      'User-Agent':
        'Mozilla/5.0 (compatible; FloreMoriaZiggy/1.0; +https://www.floremoria.com)',
      Accept: 'video/mp4,video/*,*/*',
    },
    cache: 'no-store',
    redirect: 'follow',
  });
  if (!res.ok) {
    console.warn(`[Pexels] Download MP4 fallito (${res.status})`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) {
    console.warn('[Pexels] Download MP4 troppo piccolo, scarto.');
    return null;
  }

  const blobPath = `${REEL_VIDEO_PREFIX}/pexels-${campaignId}-${Date.now()}.mp4`;
  const { url } = await put(blobPath, buf, {
    access: 'public',
    contentType: 'video/mp4',
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return url;
}

/**
 * Cerca B-roll portrait Quiet Luxury su Pexels e restituisce URL MP4.
 * Preferisce re-host su Vercel Blob per riproduzione/upload dashboard affidabile.
 */
export async function fetchPexelsPortraitBroll(input: {
  category: SocialProofCategoryCode;
  seed: string;
  /** Se false, non tenta Blob e restituisce il link Pexels grezzo. */
  preferBlobHost?: boolean;
}): Promise<PexelsBrollResult | null> {
  const apiKey = resolvePexelsApiKey();
  if (!apiKey) {
    console.warn('[Pexels] PEXELS_API_KEY assente — salto ricerca video.');
    return null;
  }

  const queries = [
    pickQuery(input.category, input.seed),
    ...PEXELS_QUERIES_BY_CATEGORY[input.category],
  ];
  // Dedup mantenendo ordine
  const uniqueQueries = [...new Set(queries)];

  let lastError: unknown;
  for (const query of uniqueQueries) {
    try {
      const videos = await searchPexelsPortrait(query, apiKey);
      if (!videos.length) continue;

      const start = hashSeed(`${input.seed}:${query}`) % videos.length;
      const ordered = [
        ...videos.slice(start),
        ...videos.slice(0, start),
      ];

      for (const video of ordered) {
        const file = selectBestPortraitMp4(video);
        if (!file) continue;

        let url = file.link;
        let hostedOnBlob = false;
        if (input.preferBlobHost !== false) {
          const hosted = await hostMp4OnBlob(file.link, input.seed);
          if (hosted) {
            url = hosted;
            hostedOnBlob = true;
          }
        }

        console.log(
          `[Pexels] ✔ B-roll id=${video.id} q="${query}" ${file.width}x${file.height} blob=${hostedOnBlob}`
        );
        return {
          url,
          sourceUrl: file.link,
          query,
          videoId: video.id,
          width: file.width,
          height: file.height,
          hostedOnBlob,
        };
      }
    } catch (err) {
      lastError = err;
      console.warn(
        `[Pexels] Query fallita "${query}":`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (lastError) {
    console.warn(
      '[Pexels] Nessun B-roll utilizzabile:',
      lastError instanceof Error ? lastError.message : lastError
    );
  }
  return null;
}
