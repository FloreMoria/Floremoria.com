/**
 * Regia visuale Reel FloreMoria — Ziggy × Google Veo / AI Studio.
 * System prompt automatico: macro Quiet Luxury, cimiteri monumentali IT/EU, golden hour.
 */

/** Negative constraints tassativi (Veo config.negativePrompt). */
export const REEL_NEGATIVE_PROMPT = [
  'no people',
  'no face',
  'no human figures',
  'no hands',
  'no floating petals',
  'no dramatic effects',
  'no text',
  'no letters',
  'no words',
  'no typography',
  'no logos',
  'no subtitles',
  'no captions',
  'no watermark',
  'no readable names',
  'no tomb inscriptions',
  'no engraved lettering',
  'no plastic flowers',
  'no cgi',
  'no 3d render',
  'no cartoon',
  'no anime',
  'no horror',
  'no jump scare',
  'no griefbait',
  'no melodrama',
  'no neon',
  'no hdr heavy',
  'no morphing petals',
  'no warping geometry',
  'no speech',
  'no voiceover',
  'no singing',
  'no TTS',
  'highly realistic',
  '60fps look',
].join(', ');

/**
 * System prompt Ziggy → Veo (testo inviato come prompt di generazione).
 * Usato anche come riferimento per AI Studio Playground.
 */
export const ZIGGY_VEO_SYSTEM_PROMPT = [
  '[ZIGGY × FloreMoria — Reel Veo 9:16, ~8s]',
  'FRAMING: Intimate macro close-up on a fresh solemn bouquet (white roses and quiet memorial blooms) resting on pale stone or Carrara-like marble.',
  'SETTING: European/Italian monumental cemetery atmosphere — inspiration San Michele (Venice) or Cimitero Monumentale: soft cypress silhouettes, distant marble architecture, anonymous and dignified. Never readable inscriptions or personal names.',
  'LIGHTING: Golden hour, warm natural light, dew drops on petals, creamy bokeh background with cypress or stone arches.',
  'CAMERA: One slow elegant move only — macro tilt-up OR gentle push-in. No cuts, no whip pans, no jump zooms.',
  'LOOK: Highly photorealistic, Quiet Luxury, editorial cinema, ~60fps temporal smoothness, ivory–sage–blush palette.',
  'MOOD: Presence, care, quiet dignity — never spectacle, never griefbait.',
  'AUDIO (if generated): soft ambient instrumental only — never speech or singing.',
  'STRICT: no people, no face, no floating petals, no dramatic effects, no text, no logos, highly realistic.',
].join(' ');

/** Blocco regia condiviso (compatibilità chiamanti). */
function cinematicCraftBlock(): string {
  return ZIGGY_VEO_SYSTEM_PROMPT;
}

/**
 * Image-to-video da foto consegna social-ready (fiori veri).
 * Fedeltà al bouquet + movimento macro Ziggy.
 */
export function veoPromptFromDeliveryFlowerPhoto(): string {
  return [
    ZIGGY_VEO_SYSTEM_PROMPT,
    'SOURCE: Animate THIS real memorial flower photo as the hero subject.',
    'Stay strictly faithful to the bouquet already in the frame: same flowers, colors, placement.',
    'Do not invent people, faces, hands, graves with readable names, plaques, or new objects.',
    'Only add subtle life: soft breeze in petals, dew catching golden light, gentle macro push-in or tilt-up.',
    'Background stays soft bokeh — unreadable, anonymous monumental garden.',
  ].join(' ');
}

/** Text-to-video / still AI → video (senza foto consegna). */
export function veoPromptFromAiStill(): string {
  return [
    ZIGGY_VEO_SYSTEM_PROMPT,
    'Generate an 8-second vertical Reel from this Quiet Luxury floral still.',
    'Macro intimacy on white roses / solemn blooms on marble; Italian monumental cemetery bokeh (San Michele / Monumentale mood).',
    'Golden hour rim light, dew on petals, slow elegant macro tilt-up or push-in.',
  ].join(' ');
}

/** Prompt Imagen per still di partenza (quando manca foto social-ready). */
export function imagenQuietLuxuryStillPrompt(input: {
  copy?: string | null;
  category?: string | null;
}): string {
  return [
    'Ultra-photorealistic vertical 9:16 still for FloreMoria / Ziggy Veo plate.',
    'Intimate macro close-up: fresh white roses and solemn memorial blooms on pale Carrara marble.',
    'Italian monumental cemetery atmosphere (San Michele Venice / Monumentale mood) as soft bokeh — cypress, stone arches, no readable names.',
    'Golden hour warm natural light, dew drops on petals, creamy depth of field.',
    'Quiet Luxury palette: ivory, sage, blush, warm stone.',
    input.category ? `Service mood hint (visual only, no text): ${input.category}.` : '',
    'NO TEXT, NO LETTERS, NO WORDS, NO WATERMARK, NO TYPOGRAPHY, CLEAN PHOTOGRAPHY ONLY.',
    'STRICT AVOID: people, faces, hands, floating petals, dramatic effects, engraved names, logos, typography, captions, lettering, CGI, griefbait.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** @deprecated Usare ZIGGY_VEO_SYSTEM_PROMPT. */
export { cinematicCraftBlock };
