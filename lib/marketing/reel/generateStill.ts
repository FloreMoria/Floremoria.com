/**
 * Still Quiet Luxury via Imagen — fallback quando manca foto consegna social-ready.
 * Vietati volti / persone / testo / anagrafiche.
 */
import { createGeminiClient, resolveImagenModel } from '@/lib/marketing/reel/geminiClient';

export async function generateQuietLuxuryStill(input: {
  copy?: string | null;
  category?: string | null;
}): Promise<{ buffer: Buffer; mimeType: string }> {
  const copyExcerpt = String(input.copy || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);

  const prompt = [
    'Quiet Luxury memorial floral still for FloreMoria brand.',
    'Vertical 9:16 cinematic photograph.',
    'Subject: elegant fresh flowers on pale marble or soft stone, natural daylight, gentle bokeh.',
    'Mood: serene presence, dignity, soft golden hour or north window light.',
    'Palette: ivory, sage, blush, desaturated terracotta, stone grey.',
    input.category ? `Category hint: ${input.category}.` : '',
    copyExcerpt ? `Inspired by mood of: ${copyExcerpt}.` : '',
    'STRICT AVOID: people, faces, hands, tombs with readable names, text overlays, logos, neon, horror, griefbait, funerary agency clichés.',
  ]
    .filter(Boolean)
    .join(' ');

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
