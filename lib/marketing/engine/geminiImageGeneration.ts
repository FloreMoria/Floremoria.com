import { GoogleGenAI } from '@google/genai';
import { enforceNoTextImagePrompt } from '@/lib/marketing/imagePromptGuard';
import { MarketingEngineConfigError } from './generation';

/** Imagen 4 dismesso 2026-08-17 — default Gemini Image (Nano Banana). */
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

const LEGACY_IMAGEN_MODEL_PREFIX = 'imagen-';

export function resolveGeminiImageModel(): string {
  const configured = process.env.MARKETING_IMAGEN_MODEL?.trim();
  if (!configured) return DEFAULT_GEMINI_IMAGE_MODEL;

  if (configured.toLowerCase().startsWith(LEGACY_IMAGEN_MODEL_PREFIX)) {
    console.warn(
      `[Marketing Images] MARKETING_IMAGEN_MODEL=${configured} è un modello Imagen deprecato — uso ${DEFAULT_GEMINI_IMAGE_MODEL}.`
    );
    return DEFAULT_GEMINI_IMAGE_MODEL;
  }

  return configured;
}

function getGeminiApiKey(): string {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new MarketingEngineConfigError(
      'GEMINI_API_KEY non configurata: impossibile generare l\'immagine.'
    );
  }
  return apiKey;
}

function extractInlineImageBytes(response: {
  candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
}): { buffer: Buffer; mimeType: string; extension: string } {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (!data) continue;
    const mimeType = part.inlineData?.mimeType?.trim() || 'image/png';
    const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
    return { buffer: Buffer.from(data, 'base64'), mimeType, extension };
  }
  throw new Error('Gemini Image non ha restituito byte immagine validi.');
}

/**
 * Genera un'immagine via Gemini Image (generateContent + responseModalities IMAGE).
 * Sostituisce Imagen 4 (generateImages) dismesso il 2026-08-17.
 */
export async function generateGeminiImageBytes(
  prompt: string,
  aspectRatio: string
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const safePrompt = enforceNoTextImagePrompt(prompt);
  const model = resolveGeminiImageModel();
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: safePrompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio },
        },
      });
      return extractInlineImageBytes(response);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) {
        console.warn(
          `[Marketing Images] Tentativo ${attempt}/${2} fallito (${model}), retry…`,
          lastError.message
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  throw new Error(
    `Errore chiamata Gemini Image (${model}): ${lastError?.message ?? 'errore sconosciuto'}`
  );
}
