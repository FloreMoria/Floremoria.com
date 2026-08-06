import { GoogleGenAI } from '@google/genai';

export function getGeminiApiKeyForReel(): string {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY mancante: impossibile generare Reel AI (Imagen/Veo).'
    );
  }
  return apiKey;
}

export function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getGeminiApiKeyForReel() });
}

/** Modello Veo: override con MARKETING_VEO_MODEL. */
export function resolveVeoModel(): string {
  return (
    process.env.MARKETING_VEO_MODEL?.trim() ||
    'veo-3.1-fast-generate-preview'
  );
}

export function resolveImagenModel(): string {
  return (
    process.env.MARKETING_IMAGEN_MODEL?.trim() ||
    'imagen-4.0-generate-001'
  );
}
