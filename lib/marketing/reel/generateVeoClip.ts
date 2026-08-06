/**
 * Genera clip Reel 9:16 con Gemini Veo (image-to-video o text-to-video).
 * Audio: solo ambiente/strumentale nativo Veo se abilitato — mai TTS/voce parlata.
 */
import { mkdtemp, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createGeminiClient,
  getGeminiApiKeyForReel,
  resolveVeoModel,
} from '@/lib/marketing/reel/geminiClient';

const POLL_MS = 8_000;
const MAX_WAIT_MS = 240_000;

export type VeoClipInput = {
  /** Prompt di movimento / scena. */
  prompt: string;
  /** Still di partenza (foto consegna o Imagen), opzionale. */
  image?: { buffer: Buffer; mimeType: string };
  /** Secondi clip (Veo tipicamente 4–8). */
  durationSeconds?: number;
};

function buildNegativePrompt(): string {
  return [
    'people',
    'faces',
    'human figures',
    'readable names',
    'tomb inscriptions',
    'text overlays',
    'logos',
    'speech',
    'talking',
    'voiceover',
    'narration',
    'singing',
    'lyrics',
    'vocals',
    'human voice',
    'TTS',
    'horror',
    'jump scare',
  ].join(', ');
}

function motionPromptFromCopy(base: string): string {
  return [
    base,
    'Gentle cinematic camera drift, soft natural light, Quiet Luxury aesthetic.',
    'Vertical 9:16. Slow elegant motion only.',
    'Ambient instrumental soundscape only if audio is generated — no speech, no singing.',
  ].join(' ');
}

export async function generateVeoReelClip(input: VeoClipInput): Promise<Buffer> {
  const ai = createGeminiClient();
  const model = resolveVeoModel();
  const prompt = motionPromptFromCopy(input.prompt);
  const wantNativeAudio = process.env.MARKETING_VEO_NATIVE_AUDIO !== '0';

  const imagePayload = input.image
    ? {
        imageBytes: input.image.buffer.toString('base64'),
        mimeType: input.image.mimeType,
      }
    : undefined;

  console.log(
    `[ReelVeo] start model=${model} image=${Boolean(imagePayload)} audio=${wantNativeAudio}`
  );

  let operation = await ai.models.generateVideos({
    model,
    prompt,
    ...(imagePayload ? { image: imagePayload } : {}),
    config: {
      numberOfVideos: 1,
      aspectRatio: '9:16',
      durationSeconds: input.durationSeconds ?? 8,
      personGeneration: 'dont_allow',
      negativePrompt: buildNegativePrompt(),
      generateAudio: wantNativeAudio,
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
    throw new Error(
      `Veo error: ${JSON.stringify(operation.error)}`
    );
  }

  const generated = operation.response?.generatedVideos?.[0];
  const video = generated?.video;
  if (!video) {
    throw new Error('Veo completato senza video in response.');
  }

  if (video.videoBytes) {
    return Buffer.from(video.videoBytes, 'base64');
  }

  // Download su file temp (Gemini API espone uri, non sempre bytes).
  const dir = await mkdtemp(join(tmpdir(), 'floremoria-veo-'));
  const outPath = join(dir, 'reel.mp4');
  try {
    await ai.files.download({
      file: generated,
      downloadPath: outPath,
    });
    return await readFile(outPath);
  } catch (downloadErr) {
    // Fallback: fetch URI + API key
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
      throw new Error(`Download Veo URI fallito (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    await unlink(outPath).catch(() => undefined);
  }
}

export function defaultVeoPromptForDeliveryFlowers(): string {
  return [
    'Cinematic close-up of fresh memorial flowers on stone,',
    'soft natural daylight, shallow depth of field,',
    'peaceful cemetery garden atmosphere without readable inscriptions,',
    'marble textures and gentle breeze in petals.',
  ].join(' ');
}

export function defaultVeoPromptForAiStill(): string {
  return [
    'Slow push-in on Quiet Luxury floral still life,',
    'ivory and sage palette, soft golden light,',
    'monumental marble detail and natural flowers,',
    'no people, serene commemorative atmosphere.',
  ].join(' ');
}
