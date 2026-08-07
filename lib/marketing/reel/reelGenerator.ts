/**
 * Generatore Reel automatici FloreMoria — Ziggy × Gemini Imagen + Veo.
 *
 * Priorità sorgente visiva:
 * 1) Foto consegna /social-ready/ (solo fiori; privacy guard)
 * 2) Still campagna (se non privata consegna)
 * 3) Still Imagen Quiet Luxury
 * 4) (opz.) B-roll URL env se Veo non disponibile
 *
 * Overlay: 3 slogan Serif (fade 1s / hold 2s / fade 1s) via ffmpeg se disponibile.
 * Audio: ambient/strumentale (Veo native e/o Lyria) — mai TTS.
 */
import { put } from '@vercel/blob';
import { isSocialReadyProofUrl } from '@/lib/deliveryProof/storagePaths';
import {
  assertDeliveryServiceSocialPrivacy,
  SOCIAL_PRIVACY_PRIMARY_RULE,
} from '@/lib/marketing/socialPrivacyGuard';
import { loadConfiguredBrollClips, pickBrollClip } from '@/lib/marketing/reel/brollLibrary';
import { burnZiggyTextOverlay } from '@/lib/marketing/reel/burnTextOverlay';
import { generateQuietLuxuryStill } from '@/lib/marketing/reel/generateStill';
import {
  defaultVeoPromptForAiStill,
  defaultVeoPromptForDeliveryFlowers,
  generateVeoReelClip,
} from '@/lib/marketing/reel/generateVeoClip';
import { resolveOrCreateInstrumentalMusicUrl } from '@/lib/marketing/reel/instrumentalAudio';
import { buildReelOnScreenLines } from '@/lib/marketing/reel/reelTextAudio';

const REEL_VIDEO_PREFIX = 'marketing/campagne/reel-videos';

export type GenerateReelInput = {
  campaignId: string;
  imageUrl?: string;
  copy?: string | null;
  category?: string | null;
  deceasedName?: string | null;
  blobToken?: string;
};

type StillSource = {
  buffer: Buffer;
  mimeType: string;
  kind: 'social-ready' | 'campaign' | 'imagen';
};

async function fetchStillBytes(
  url: string,
  blobToken?: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const isPrivateBlob = url.includes('private.blob.vercel-storage.com');
  if (isPrivateBlob) {
    const token = blobToken || process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
      throw new Error('BLOB_READ_WRITE_TOKEN richiesto per leggere still privato.');
    }
    const { getBlobWithAccessFallback } = await import('@/lib/blob/storeAccess');
    const pathname = new URL(url).pathname.replace(/^\//, '');
    const blobResult = await getBlobWithAccessFallback(pathname, {
      token,
      useCache: false,
    });
    if (!blobResult?.stream || blobResult.statusCode !== 200) {
      throw new Error('Impossibile scaricare still da Vercel Blob privato.');
    }
    return {
      buffer: Buffer.from(await new Response(blobResult.stream).arrayBuffer()),
      mimeType: 'image/jpeg',
    };
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download still fallito (${res.status})`);
  }
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType };
}

async function resolveStillSource(input: GenerateReelInput): Promise<StillSource> {
  const imageUrl = input.imageUrl?.trim();

  if (imageUrl && isSocialReadyProofUrl(imageUrl)) {
    assertDeliveryServiceSocialPrivacy({
      imageUrl,
      copy: input.copy || '',
      deceasedName: input.deceasedName,
      context: `reel:${input.campaignId}`,
    });
    const fetched = await fetchStillBytes(imageUrl, input.blobToken);
    return { ...fetched, kind: 'social-ready' };
  }

  if (imageUrl && !/delivery-proof|foto-consegne\/delivery/i.test(imageUrl)) {
    try {
      const fetched = await fetchStillBytes(imageUrl, input.blobToken);
      if (fetched.mimeType.startsWith('image/')) {
        return { ...fetched, kind: 'campaign' };
      }
    } catch (e) {
      console.warn(
        '[ReelGenerator] Still campagna non leggibile, fallback Imagen:',
        e instanceof Error ? e.message : e
      );
    }
  }

  if (
    imageUrl &&
    /delivery-proof|foto-consegne\/delivery/i.test(imageUrl) &&
    !isSocialReadyProofUrl(imageUrl)
  ) {
    console.warn(
      `[ReelGenerator] ${SOCIAL_PRIVACY_PRIMARY_RULE} Foto privata ignorata → Imagen.`
    );
  }

  const still = await generateQuietLuxuryStill({
    copy: input.copy,
    category: input.category,
  });
  return { ...still, kind: 'imagen' };
}

export type ReelVideoSource = 'veo' | 'broll' | 'template';

export type ReelGenerationResult = {
  url: string;
  source: ReelVideoSource;
  /** Errore Veo originale se si è degradati a B-roll/template. */
  veoError?: unknown;
};

/**
 * Restituisce URL MP4 9:16 + sorgente (Veo vs B-roll) per diagnostica/fallback UI.
 */
export async function generateAutomaticReelVideoDetailed(
  input: GenerateReelInput
): Promise<ReelGenerationResult | null> {
  const token = input.blobToken || process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    console.error('[ReelGenerator] BLOB_READ_WRITE_TOKEN mancante.');
    // Senza Blob non possiamo caricare Veo: prova comunque B-roll pubblici env.
    return resolveEnvBrollResult(input.campaignId);
  }

  void resolveOrCreateInstrumentalMusicUrl().catch(() => undefined);

  const overlayLines = buildReelOnScreenLines(input.copy);
  let veoError: unknown;

  try {
    const still = await resolveStillSource(input);
    const prompt =
      still.kind === 'social-ready'
        ? defaultVeoPromptForDeliveryFlowers()
        : defaultVeoPromptForAiStill();

    console.log(
      `[ReelGenerator] Campagna ${input.campaignId} · still=${still.kind} · Veo Ziggy · slogans=${overlayLines.length} · TTS=vietato`
    );

    let mp4 = await generateVeoReelClip({
      prompt,
      image: { buffer: still.buffer, mimeType: still.mimeType },
      durationSeconds: 8,
    });

    const burned = await burnZiggyTextOverlay({
      videoMp4: mp4,
      copy: input.copy,
      lines: overlayLines,
    });
    if (burned) {
      mp4 = burned;
    } else {
      console.info(
        '[ReelGenerator] Overlay testo non applicato (no ffmpeg) — caption Meta resta la fonte slogan.'
      );
    }

    const blobPath = `${REEL_VIDEO_PREFIX}/${input.campaignId}-${Date.now()}.mp4`;
    const { url } = await put(blobPath, mp4, {
      access: 'public',
      contentType: 'video/mp4',
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    console.log(`[ReelGenerator] ✔ Reel Ziggy caricato: ${url}`);
    return { url, source: 'veo' };
  } catch (e) {
    veoError = e;
    console.warn(
      '[ReelGenerator] Generazione Veo/Imagen fallita, provo fallback B-roll env:',
      e instanceof Error ? e.message : e
    );
  }

  const fallback = resolveEnvBrollResult(input.campaignId);
  if (fallback) {
    return { ...fallback, veoError };
  }

  console.error(
    '[ReelGenerator] Nessun Reel generabile. Verifica GEMINI_API_KEY + accesso Veo/Imagen su AI Studio.'
  );
  return null;
}

function resolveEnvBrollResult(campaignId: string): ReelGenerationResult | null {
  const clips = loadConfiguredBrollClips();
  const clip = pickBrollClip(campaignId, clips);
  if (clip) {
    console.log(`[ReelGenerator] Fallback B-roll env: ${clip.label}`);
    return { url: clip.url, source: 'broll' };
  }

  const prebuilt = process.env.MARKETING_REEL_TEMPLATE_MP4_URL?.trim();
  if (prebuilt && /^https?:\/\//i.test(prebuilt)) {
    return { url: prebuilt, source: 'template' };
  }
  return null;
}

/**
 * Restituisce URL MP4 9:16 per pubblicazione Reel.
 */
export async function generateAutomaticReelVideo(
  input: GenerateReelInput
): Promise<string | null> {
  const result = await generateAutomaticReelVideoDetailed(input);
  return result?.url ?? null;
}
