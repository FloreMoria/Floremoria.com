/**
 * Still Quiet Luxury via Imagen — fallback quando manca foto consegna social-ready.
 * Vietati volti / persone / testo / anagrafiche.
 */
import { generateGeminiImageBytes } from '@/lib/marketing/engine/geminiImageGeneration';
import { imagenQuietLuxuryStillPrompt } from '@/lib/marketing/reel/reelDirection';

export async function generateQuietLuxuryStill(input: {
  copy?: string | null;
  category?: string | null;
}): Promise<{ buffer: Buffer; mimeType: string }> {
  const prompt = imagenQuietLuxuryStillPrompt(input);
  const mimeType = 'image/png';

  const { buffer } = await generateGeminiImageBytes(prompt, '9:16');

  return { buffer, mimeType };
}
