/**
 * Guardrail tassativo: l'AI non deve MAI renderizzare testo nei pixel dell'immagine.
 * Typography, slogan e logo passano solo da overlay Sharp/SVG/ffmpeg deterministici.
 */

/** Blocco obbligatorio append a ogni prompt di generazione immagine. */
export const AI_IMAGE_NO_TEXT_DIRECTIVE =
  'NO TEXT, NO LETTERS, NO WORDS, NO WATERMARK, NO TYPOGRAPHY, CLEAN PHOTOGRAPHY ONLY. ' +
  'Zero readable characters, inscriptions, logos, captions, or typography in the image. ' +
  'Pure photographic scene: floral still life, soft natural light, elegant memorial mood.';

const TEXT_IN_IMAGE_REQUEST =
  /\b(?:add|include|show|render|write|display|overlay|embed|put|place|with)\s+(?:the\s+)?(?:text|words?|letters?|slogan|headline|caption|typography|typeface|font|logo|watermark|brand(?:ing)?|inscription|lettering)\b/i;

const LITERAL_TEXT_IN_SCENE =
  /\b(?:text\s+(?:that\s+)?(?:reads|says|showing)|(?:slogan|headline|caption|words)\s+(?:in|on)\s+(?:the\s+)?image|typography\s+in\s+scene|on-?screen\s+text\s+in\s+photo)\b/i;

/** Pattern che chiedono esplicitamente testo nel prompt immagine — da rimuovere o bloccare. */
export function imagePromptRequestsGeneratedText(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false;
  return TEXT_IN_IMAGE_REQUEST.test(p) || LITERAL_TEXT_IN_SCENE.test(p);
}

/** Rimuove istruzioni pericolose e appende il blocco NO TEXT se assente. */
export function enforceNoTextImagePrompt(prompt: string): string {
  let cleaned = prompt
    .replace(/\[AVOID\]:[^\[]*(?:scritte?|testo|typography|logo)[^\[]*/gi, '[AVOID]: Loghi, scritte, grafiche, colori neon, effetto stock photo.')
    .replace(
      /\b(?:add|include|show|render|write|display|overlay|embed)\s+(?:the\s+)?(?:text|words?|letters?|slogan|headline|caption|typography|logo|watermark)[^.!?\n]*/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (!/\bNO TEXT\b/i.test(cleaned)) {
    cleaned = `${cleaned} ${AI_IMAGE_NO_TEXT_DIRECTIVE}`.trim();
  }

  return cleaned;
}

/** Blocco standard per fallback prompt campagna. */
export const IMAGE_PROMPT_AVOID_BLOCK =
  '[AVOID]: Loghi, scritte, parole, watermark, tipografia, testo sovrapposto, colori neon, effetto stock photo.';
