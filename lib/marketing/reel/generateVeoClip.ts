/**
 * Genera clip Reel 9:16 con Gemini Veo (image-to-video o text-to-video).
 * Regia: lib/marketing/reel/reelDirection.ts — fotorealismo Quiet Luxury, no TTS.
 */
import { mkdtemp, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createGeminiClient,
  getGeminiApiKeyForReel,
  resolveVeoModel,
} from '@/lib/marketing/reel/geminiClient';
import {
  REEL_NEGATIVE_PROMPT,
  STANDARD_SCENE_DURATION_SEC,
  STRICT_NO_TEXT_VIDEO_RULE,
  veoPromptFromAiStill,
  veoPromptFromDeliveryFlowerPhoto,
} from '@/lib/marketing/reel/reelDirection';
import { classifyVeoError } from '@/lib/media/veoClient';

const POLL_MS = 8_000;
const MAX_WAIT_MS = 240_000;

export type VeoClipInput = {
  /** Prompt di movimento / scena (già completo di regia). */
  prompt: string;
  /** Still di partenza (foto consegna o Imagen), opzionale. */
  image?: { buffer: Buffer; mimeType: string };
  /** Secondi clip (standard FloreMoria: micro-clip da 2.0 a 3.0s a loop). */
  durationSeconds?: number;
};

/** Rilancia con messaggio SDK preservato + prefisso diagnostico classificato. */
function rethrowClassifiedVeo(err: unknown, phase: string): never {
  const classified = classifyVeoError(err);
  console.error(
    `[ReelVeo] ${phase} kind=${classified.kind} upstream=${classified.upstreamStatus ?? 'n/a'} detail=${classified.detail}`
  );
  const enriched = new Error(
    `[Veo:${classified.kind}] ${classified.detail}`
  ) as Error & { veoKind?: string; upstreamStatus?: number };
  enriched.veoKind = classified.kind;
  enriched.upstreamStatus = classified.upstreamStatus;
  if (err instanceof Error && err.stack) enriched.stack = err.stack;
  throw enriched;
}

export async function generateVeoReelClip(input: VeoClipInput): Promise<Buffer> {
  const ai = createGeminiClient();
  const model = resolveVeoModel();
  const wantNativeAudio = process.env.MARKETING_VEO_NATIVE_AUDIO !== '0';
  // Qualità > velocità: enhancePrompt aiuta Veo a espandere la regia senza inventare persone.
  const enhancePrompt = process.env.MARKETING_VEO_ENHANCE_PROMPT !== '0';
  const duration = Math.min(3, Math.max(2, input.durationSeconds ?? Math.round(STANDARD_SCENE_DURATION_SEC)));

  const imagePayload = input.image
    ? {
        imageBytes: input.image.buffer.toString('base64'),
        mimeType: input.image.mimeType,
      }
    : undefined;

  console.log(
    `[ReelVeo] start model=${model} duration=${duration}s image=${Boolean(imagePayload)} audio=${wantNativeAudio} enhance=${enhancePrompt}`
  );

  try {
    let operation = await ai.models.generateVideos({
      model,
      prompt: input.prompt,
      ...(imagePayload ? { image: imagePayload } : {}),
      config: {
        numberOfVideos: 1,
        aspectRatio: '9:16',
        durationSeconds: duration,
        personGeneration: 'dont_allow',
        negativePrompt: REEL_NEGATIVE_PROMPT,
        generateAudio: wantNativeAudio,
        enhancePrompt,
        // 1080p se supportato dal modello; altrimenti Veo ignora / fallback.
        resolution: process.env.MARKETING_VEO_RESOLUTION?.trim() || '1080p',
      },
    });

    const started = Date.now();
    while (!operation.done) {
      if (Date.now() - started > MAX_WAIT_MS) {
        throw new Error(`Veo timeout dopo ${MAX_WAIT_MS / 1000}s (${model}).`);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
      throw new Error(`Veo error: ${JSON.stringify(operation.error)}`);
    }

    const generated = operation.response?.generatedVideos?.[0];
    const video = generated?.video;
    if (!video) {
      throw new Error('Veo completato senza video in response.');
    }

    if (video.videoBytes) {
      return Buffer.from(video.videoBytes, 'base64');
    }

    const dir = await mkdtemp(join(tmpdir(), 'floremoria-veo-'));
    const outPath = join(dir, 'reel.mp4');
    try {
      await ai.files.download({
        file: generated,
        downloadPath: outPath,
      });
      return await readFile(outPath);
    } catch (downloadErr) {
      const uri = video.uri?.trim();
      if (!uri) {
        throw downloadErr instanceof Error
          ? downloadErr
          : new Error('Veo: download fallito e uri assente.');
      }
      const key = getGeminiApiKeyForReel();
      const url = uri.includes('key=')
        ? uri
        : `${uri}${uri.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `Download Veo URI fallito (${res.status})${body ? `: ${body.slice(0, 400)}` : ''}`
        );
      }
      return Buffer.from(await res.arrayBuffer());
    } finally {
      await unlink(outPath).catch(() => undefined);
    }
  } catch (err) {
    rethrowClassifiedVeo(err, 'generate');
  }
}

export function defaultVeoPromptForDeliveryFlowers(): string {
  return veoPromptFromDeliveryFlowerPhoto();
}

export function defaultVeoPromptForAiStill(): string {
  return veoPromptFromAiStill();
}
