/**
 * Regia visuale Micro-Video FloreMoria — Ziggy × Google Veo / AI Studio.
 * Strategia 100% video: micro-clip da 2.0 a 3.0 secondi a loop continuo.
 * System prompt automatico: macro Quiet Luxury, dettagli realistici, cimiteri monumentali IT/EU, golden hour.
 */

/** Durata standard delle scene generate per micro-clip a loop continuo (2.0–3.0s). */
export const MIN_SCENE_DURATION_SEC = 2.0;
export const MAX_SCENE_DURATION_SEC = 3.0;
export const STANDARD_SCENE_DURATION_SEC = 2.5;

/** Divieto assoluto testo nei frame video. */
export const STRICT_NO_TEXT_VIDEO_RULE =
  'NO TEXT, NO LETTERS, CLEAN CINEMATOGRAPHIC FOOTAGE ONLY';

/** Negative constraints tassativi (Veo config.negativePrompt). */
export const REEL_NEGATIVE_PROMPT = [
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
  'no plaque text',
  'no facial distortions',
  'no face deformities',
  'no warped faces',
  'no morphed hands',
  'no extra fingers',
  'no floating petals',
  'no dramatic effects',
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
 * System prompt Ziggy → Veo (micro-clip 9:16, 2-3 secondi a loop continuo).
 * Focus su macro-dettagli realistici ed eleganti:
 * - mani che scrivono una lettera con inchiostro
 * - mani che legano un nastro di seta attorno a fiori freschi
 * - riflessi di luce naturale morbida
 * - camminate lente di profilo senza deformazioni facciali
 */
export const ZIGGY_VEO_SYSTEM_PROMPT = [
  '[ZIGGY × FloreMoria — Micro-Video Veo 9:16, 2-3s Seamless Continuous Loop]',
  'FRAMING & MACRO DETAILS: Ultra-realistic and elegant macro cinematography. Intimate focus on authentic gestures and tactile materials: hands writing a thoughtful memorial letter with deep dark ink on textured ivory cotton paper, hands delicately tying a soft silk ribbon around a fresh solemn bouquet (white roses, eucalyptus, pale petals), soft natural caustic light reflections dancing on pale Carrara marble or weathered stone, slow dignified profile walk in soft focus without facial distortions.',
  'SETTING: European and Italian monumental cemetery ambiance (inspiration San Michele Venice, Cimitero Monumentale Milano): gentle cypress silhouettes, distant marble columns and arches in creamy bokeh, anonymous, timeless and dignified. Never readable inscriptions, plaques or personal names.',
  'LIGHTING & ATMOSPHERE: Golden hour, warm diffused natural light, glistening dew drops on fresh botanical petals, soft morning haze, seamless temporal coherence.',
  'CAMERA MOTION & LOOP: One slow, subtle micro-movement engineered for a seamless, continuous 2 to 3 seconds loop (gentle macro push-in or subtle tilt-up). No cuts, no whip pans, no jump zooms, no morphing artifacts.',
  'LOOK: Hyper-photorealistic, Quiet Luxury, high-end editorial cinema, ~60fps temporal smoothness, ivory–sage–blush–warm stone palette.',
  'MOOD: Presence, care, quiet dignity, tenderness — never spectacle, never griefbait.',
  'AUDIO (if generated): Soft ambient instrumental/nature air only — never speech, voiceover, singing or TTS.',
  `STRICT CONSTRAINT: ${STRICT_NO_TEXT_VIDEO_RULE}. Zero typography, zero engraved names, zero logos, zero watermarks.`,
].join(' ');

/** Blocco regia condiviso (compatibilità chiamanti). */
function cinematicCraftBlock(): string {
  return ZIGGY_VEO_SYSTEM_PROMPT;
}

/**
 * Image-to-video da foto consegna social-ready (fiori veri).
 * Trasforma la foto in un micro-clip da 2-3s a loop continuo con macro-dettagli reali.
 */
export function veoPromptFromDeliveryFlowerPhoto(): string {
  return [
    ZIGGY_VEO_SYSTEM_PROMPT,
    'SOURCE: Animate THIS real memorial flower photo into a 2.5-second seamless continuous loop micro-clip.',
    'Stay strictly faithful to the bouquet already in the frame: same flowers, colors, placement.',
    'Add realistic macro life: hands tying a silk ribbon or delicate breeze catching fresh petals in soft golden light.',
    'Ensure loopable closure with perfect temporal transition. Zero facial distortions, zero readable text.',
    STRICT_NO_TEXT_VIDEO_RULE,
  ].join(' ');
}

/** Text-to-video / still AI → micro-clip 2-3s a loop continuo. */
export function veoPromptFromAiStill(): string {
  return [
    ZIGGY_VEO_SYSTEM_PROMPT,
    'Generate a 2.5-second vertical 9:16 micro-clip with seamless continuous loop from this Quiet Luxury still.',
    'Macro intimate focus: hands writing with ink on paper, hands tying silk ribbon on fresh solemn flowers, or soft natural light reflections on pale Carrara marble.',
    'Fluid looping motion, subtle breeze, creamy monumental bokeh.',
    STRICT_NO_TEXT_VIDEO_RULE,
  ].join(' ');
}

/** Prompt Imagen per still di partenza (quando manca foto social-ready). */
export function imagenQuietLuxuryStillPrompt(input: {
  copy?: string | null;
  category?: string | null;
}): string {
  return [
    'Ultra-photorealistic vertical 9:16 still for FloreMoria 2-3s looping micro-clip plate.',
    'Macro focus on elegant gestures and details: hands writing a memorial letter with ink on fine paper, hands tying a silk ribbon around fresh white roses and solemn memorial blooms, or soft natural light reflecting on pale Carrara marble.',
    'Italian monumental cemetery atmosphere (San Michele Venice / Monumentale Milano mood) as soft bokeh — cypress, stone arches, no readable names.',
    'Golden hour warm natural light, dew drops on petals, creamy depth of field.',
    'Quiet Luxury palette: ivory, sage, blush, warm stone.',
    input.category ? `Service mood hint (visual only, no text): ${input.category}.` : '',
    'NO TEXT, NO LETTERS, NO WORDS, NO WATERMARK, NO TYPOGRAPHY, CLEAN CINEMATOGRAPHIC FOOTAGE ONLY.',
    'STRICT AVOID: facial distortions, morphed hands, extra fingers, readable names, engraved plaques, neon, CGI, griefbait.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** @deprecated Usare ZIGGY_VEO_SYSTEM_PROMPT. */
export { cinematicCraftBlock };

