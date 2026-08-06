/**
 * Regia visuale Reel FloreMoria (ZIGGY + MARTINA + SOFIA + ALMA).
 * Obiettivo: clip credibili, fotorealistici, Quiet Luxury — mai griefbait / stock cheap.
 */

export const REEL_NEGATIVE_PROMPT = [
  // Persone & privacy
  'people',
  'faces',
  'human figures',
  'hands holding flowers',
  'portrait',
  'readable names',
  'tomb inscriptions',
  'engraved lettering',
  'headstone text',
  'cross with plaque text',
  // Cheap / fake AI look
  'plastic flowers',
  'artificial looking petals',
  'cartoon',
  'anime',
  '3d render',
  'cgi',
  'over-sharpened',
  'hdr heavy',
  'neon colors',
  'oversaturated',
  'stock photo watermark',
  'low resolution',
  'blurry mush',
  'morphing petals',
  'warping geometry',
  'flicker',
  'jittery camera',
  'dutch angle chaos',
  // Tone
  'horror',
  'jump scare',
  'melodrama',
  'funeral home cliché',
  'griefbait',
  'crying',
  'dark gothic excess',
  // Text / brand clutter
  'text overlays',
  'subtitles',
  'logos',
  'captions',
  'watermark',
  // Audio (se generateAudio)
  'speech',
  'talking',
  'voiceover',
  'narration',
  'singing',
  'lyrics',
  'vocals',
  'human voice',
  'TTS',
  'podcast voice',
].join(', ');

/** Blocco regia comune: fotorealismo + movimento sobrio. */
function cinematicCraftBlock(): string {
  return [
    'Photorealistic documentary-editorial look, as if shot on a full-frame cinema camera with a 50mm lens.',
    'True-to-life textures: soft petals, natural dew or soft light, pale marble or stone, gentle depth of field.',
    'Color grade: muted Quiet Luxury — ivory, sage, blush, warm stone grey; never neon, never HDR punch.',
    'Camera: ONE slow elegant move only (gentle push-in OR subtle lateral drift OR soft rack focus). No cuts, no whip pans, no zooms jumps.',
    'Motion of subject: barely-there breeze in petals or leaves; everything else still and stable.',
    'Lighting: natural daylight or soft golden hour; diffuse, respectful, never harsh flash.',
    'Vertical 9:16 composition with calm negative space; subject centered or slightly lower third.',
    'Mood: dignified presence and quiet care — never sad spectacle, never horror, never melodrama.',
    'If audio is generated: soft ambient instrumental pads only; absolute silence of speech and singing.',
  ].join(' ');
}

/**
 * Image-to-video da foto consegna social-ready (fiori veri).
 * Deve restare fedele all’immagine: non inventare tombe/nomi/persone.
 */
export function veoPromptFromDeliveryFlowerPhoto(): string {
  return [
    'Animate this real memorial flower arrangement as a short cinematic Reel.',
    'Stay strictly faithful to the flowers and composition already in the image: same bouquet, same colors, same placement.',
    'Do not invent people, faces, hands, graves with readable names, plaques, or new objects.',
    'Only add subtle life: a soft breeze through petals, tiny light shift, shallow focus breathing.',
    'Background stays soft and unreadable — no inscriptions, no personal identity details.',
    cinematicCraftBlock(),
  ].join(' ');
}

/** Text-to-video / still AI → video (senza foto consegna). */
export function veoPromptFromAiStill(): string {
  return [
    'Cinematic vertical Reel of Quiet Luxury memorial florals in an Italian monumental garden.',
    'Subject: fresh seasonal flowers resting on pale Carrara-like marble or soft weathered stone,',
    'with blurred cypress or soft foliage in the far background — no readable cemetery text.',
    'Optional distant architectural marble sculpture silhouette, out of focus, anonymous.',
    'Atmosphere of serene presence and care, golden-hour rim light on petals.',
    cinematicCraftBlock(),
  ].join(' ');
}

/** Prompt Imagen per still di partenza (quando manca foto social-ready). */
export function imagenQuietLuxuryStillPrompt(input: {
  copy?: string | null;
  category?: string | null;
}): string {
  const copyExcerpt = String(input.copy || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

  return [
    'Ultra-photorealistic vertical 9:16 editorial photograph for FloreMoria.',
    'Quiet Luxury memorial florals: real fresh flowers on pale marble slab, soft natural light, shallow depth of field.',
    'Real botanical detail (MARTINA): credible petal veins, natural asymmetry, no plastic look.',
    'Palette: ivory, sage, blush, desaturated terracotta, stone grey.',
    'Environment: serene Italian cemetery garden atmosphere without any readable names or plaques.',
    input.category ? `Service mood hint: ${input.category}.` : '',
    copyExcerpt ? `Emotional tone (never literal text in image): ${copyExcerpt}.` : '',
    'STRICT AVOID: people, faces, hands, engraved names, logos, typography, neon, CGI look, griefbait, funeral-home cliché.',
  ]
    .filter(Boolean)
    .join(' ');
}
