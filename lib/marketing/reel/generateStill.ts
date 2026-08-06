/**
 * Still Quiet Luxury via Imagen — fallback quando manca foto consegna social-ready.
 * Vietati volti / persone / testo / anagrafiche.
 */
import { createGeminiClient, resolveImagenModel } from '@/lib/marketing/reel/geminiClient';
import { imagenQuietLuxuryStillPrompt } from '@/lib/marketing/reel/reelDirection';

export async function generateQuietLuxuryStill(input: {
  copy?: string | null;
  category?: string | null;
}): Promise<{ buffer: Buffer; mimeType: string }> {
  const prompt = imagenQuietLuxuryStillPrompt(input);
  const ai = createGeminiClient();
  const model = resolveImagenModel();
  const mimeType = 'image/png';

  const response = await ai.models.generateImages({
    model,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '9:16',
      outputMimeType: mimeType,
    },
  });

  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    throw new Error(`Imagen (${model}) non ha restituito immagine.`);
  }

  return { buffer: Buffer.from(imageBytes, 'base64'), mimeType };
}
