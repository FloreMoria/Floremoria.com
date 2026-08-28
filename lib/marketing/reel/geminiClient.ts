import { GoogleGenAI } from '@google/genai';
import {
  MISSING_VEO_API_KEY_MESSAGE,
  requireGeminiVeoApiKey,
  resolveGeminiVeoApiKey,
} from '@/lib/media/veoClient';

export { MISSING_VEO_API_KEY_MESSAGE, resolveGeminiVeoApiKey };

export function getGeminiApiKeyForReel(): string {
  try {
    return requireGeminiVeoApiKey();
  } catch {
    throw new Error(MISSING_VEO_API_KEY_MESSAGE);
  }
}

export function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getGeminiApiKeyForReel() });
}

/**
 * Modello Veo: default qualità (non fast).
 * Override: MARKETING_VEO_MODEL=veo-3.1-fast-generate-preview per costi/velocità.
 */
export function resolveVeoModel(): string {
  return (
    process.env.MARKETING_VEO_MODEL?.trim() ||
    'veo-3.1-generate-preview'
  );
}

export function resolveGeminiImageModel(): string {
  const configured = process.env.MARKETING_IMAGEN_MODEL?.trim();
  if (!configured || configured.toLowerCase().startsWith('imagen-')) {
    return 'gemini-2.5-flash-image';
  }
  return configured;
}

/** @deprecated Usa resolveGeminiImageModel — alias per compatibilità reel. */
export function resolveImagenModel(): string {
  return resolveGeminiImageModel();
}
