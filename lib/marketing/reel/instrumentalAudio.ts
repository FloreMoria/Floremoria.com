/**
 * Audio strumentale per Reel: cache su Blob.
 * Priorità: MARKETING_REEL_MUSIC_URL → cache Blob → genera via Lyria clip se disponibile.
 * Mai TTS / voce parlata.
 */
import { put, list } from '@vercel/blob';
import { createGeminiClient } from '@/lib/marketing/reel/geminiClient';

const MUSIC_BLOB_PREFIX = 'marketing/reel-audio';
const CACHE_PATH = `${MUSIC_BLOB_PREFIX}/instrumental-ambient-v1.mp3`;

function getBlobToken(): string | null {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

/** Risolve URL musica strumentale (env o cache Blob). Non genera TTS. */
export async function resolveOrCreateInstrumentalMusicUrl(): Promise<string | null> {
  const configured = process.env.MARKETING_REEL_MUSIC_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured;
  }

  const token = getBlobToken();
  if (!token) return null;

  try {
    const listed = await list({ prefix: MUSIC_BLOB_PREFIX, token, limit: 20 });
    const hit = listed.blobs.find((b) => b.pathname === CACHE_PATH || b.pathname.endsWith('.mp3'));
    if (hit?.url) {
      console.log('[ReelAudio] Cache strumentale trovata su Blob.');
      return hit.url;
    }
  } catch (e) {
    console.warn(
      '[ReelAudio] List Blob fallita:',
      e instanceof Error ? e.message : e
    );
  }

  // Lyria clip (preview): se il modello non è abilitato, silenzio — Veo può già portare ambient.
  try {
    const generated = await tryGenerateLyriaInstrumental();
    if (generated) {
      const { url } = await put(CACHE_PATH, generated.buffer, {
        access: 'public',
        contentType: generated.mimeType,
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      console.log('[ReelAudio] Lyria strumentale salvato su Blob (no TTS).');
      return url;
    }
  } catch (e) {
    console.warn(
      '[ReelAudio] Lyria non disponibile — Reel userà audio nativo Veo o silenzio:',
      e instanceof Error ? e.message : e
    );
  }

  return null;
}

async function tryGenerateLyriaInstrumental(): Promise<{
  buffer: Buffer;
  mimeType: string;
} | null> {
  const model =
    process.env.MARKETING_LYRIA_MODEL?.trim() || 'lyria-3-clip-preview';
  const ai = createGeminiClient();

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: [
              'Generate a short soft ambient instrumental music clip only.',
              'No vocals, no speech, no singing, no lyrics.',
              'Quiet Luxury memorial mood: gentle piano and soft pads, 15–30 seconds.',
            ].join(' '),
          },
        ],
      },
    ],
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (inline?.data && inline.mimeType?.startsWith('audio/')) {
      return {
        buffer: Buffer.from(inline.data, 'base64'),
        mimeType: inline.mimeType,
      };
    }
  }

  return null;
}
