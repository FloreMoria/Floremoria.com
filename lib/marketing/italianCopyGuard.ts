/**
 * Guardiani linguistici: copy e slogan in italiano naturale, colto e sobrio.
 * Blocca allucinazioni tipografiche e calchi dall'inglese prima del dispatch.
 */

export type ItalianCopyValidation = {
  ok: boolean;
  issues: string[];
};

/** Catalogo controllato — unica fonte per overlay deterministici (Reel, layout feed). */
export const APPROVED_FLOREMORIA_SLOGANS = [
  'La presenza che unisce il ricordo.',
  'Accanto a chi ami, sempre.',
  'Un gesto floreale, un ricordo eterno.',
  'La distanza non cancella il ricordo.',
  'Cura e presenza per i tuoi cari.',
  'Un gesto di cura e rispetto, portato con discrezione.',
  'Quando le parole mancano, resta un gesto.',
  'Memoria e cura, senza urgenza né spettacolo.',
] as const;

/** Termini allucinati o vietati (case-insensitive). */
const PROHIBITED_COPY_FRAGMENTS = [
  'testismienta',
  'cercvari',
  'presenca',
  'click here',
  'shop now',
  'buy now',
  'limited time',
  'last chance',
  'fomo',
  'griefbait',
  'your presence',
  'memorial service now',
];

/** Parole inglesi/spagnolo fuori contesto brand in copy italiano. */
const FOREIGN_CALQUE_PATTERN =
  /\b(?:your|always|forever|memorial|service|shop|buy|now|limited|offer|deal|amazing|awesome|click|share|save|follow|subscribe|presencia|recuerdo|siempre)\b/i;

/** Sequenze consonantiche improbabili in italiano (allucinazioni OCR/AI). */
const UNLIKELY_ITALIAN_WORD =
  /\b[a-zàèéìòù]{8,}\b/gi;

function hasUnlikelyItalianTokens(text: string): string[] {
  const issues: string[] = [];
  const tokens = text.match(UNLIKELY_ITALIAN_WORD) || [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (APPROVED_FLOREMORIA_SLOGANS.some((s) => s.toLowerCase().includes(lower))) continue;
    if (/floremoria|quietluxury|omaggiofloreale|fiorisulletombe|memoriaecura|curadelservizio/i.test(lower)) {
      continue;
    }
    // 4+ consonanti consecutive → probabile allucinazione
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(lower.replace(/[àèéìòù]/g, ''))) {
      issues.push(`Parola sospetta: "${token}"`);
    }
  }
  return issues;
}

export function pickApprovedSlogan(seed = ''): string {
  const list = APPROVED_FLOREMORIA_SLOGANS;
  if (!seed.trim()) return list[0]!;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return list[hash % list.length]!;
}

/** Tre slogan per overlay Reel — sempre dal catalogo approvato. */
export function pickApprovedReelSlogans(seed = ''): [string, string, string] {
  const base = pickApprovedSlogan(seed);
  const idx = APPROVED_FLOREMORIA_SLOGANS.indexOf(base as (typeof APPROVED_FLOREMORIA_SLOGANS)[number]);
  const i0 = idx >= 0 ? idx : 0;
  const i1 = (i0 + 2) % APPROVED_FLOREMORIA_SLOGANS.length;
  const i2 = (i0 + 4) % APPROVED_FLOREMORIA_SLOGANS.length;
  return [
    APPROVED_FLOREMORIA_SLOGANS[i0]!,
    APPROVED_FLOREMORIA_SLOGANS[i1]!,
    'FloreMoria',
  ];
}

/**
 * Valida copy/caption prima di salvataggio o pubblicazione.
 * Non sostituisce i Guardiani Gemini — aggiunge lint deterministico.
 */
export function validateItalianMarketingCopy(text: string): ItalianCopyValidation {
  const issues: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, issues: ['Copy vuoto.'] };
  }

  const lower = trimmed.toLowerCase();
  for (const bad of PROHIBITED_COPY_FRAGMENTS) {
    if (lower.includes(bad)) {
      issues.push(`Termine vietato o allucinato: "${bad}"`);
    }
  }

  if (FOREIGN_CALQUE_PATTERN.test(trimmed)) {
    issues.push('Rilevato calco dall\'inglese/spagnolo — usa solo italiano naturale.');
  }

  issues.push(...hasUnlikelyItalianTokens(trimmed));

  // Frasi troppo corte senza punteggiatura (spesso hook malformati)
  const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length > 12 && line.length < 80 && !/[.!?…]$/.test(line) && !/^#/.test(line)) {
      // soft warning only for very suspicious tokens inside
      if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(line.replace(/\s/g, ''))) {
        issues.push(`Frase sospetta: "${line.slice(0, 48)}…"`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function assertValidItalianMarketingCopy(text: string, context = 'copy'): void {
  const result = validateItalianMarketingCopy(text);
  if (!result.ok) {
    throw new Error(
      `[ItalianCopyGuard] ${context} non valido: ${result.issues.slice(0, 3).join(' · ')}`
    );
  }
}

/** Direttiva da iniettare nei system prompt copy (CLEO/ZIGGY/Guardiani). */
export const ITALIAN_COPY_SYSTEM_DIRECTIVE = `
## ITALIANO IMPECCABILE (obbligatorio — SOFIA + ALMA + PROF)

- Tono naturale, sobrio, empatico, elegante e rispettoso del contesto commemorativo.
- Italiano colto e corretto: niente calchi dall'inglese o dallo spagnolo, niente neologismi inventati.
- Vietati termini inventati, typo grossolani, griefbait, urgenza artificiale, dark pattern sul dolore.
- Il testo visibile nei post (copy, didascalie, headline) NON va nel prompt immagine: mai chiedere testo nei pixel.
- Per slogan brevi usa solo formulazioni sobrie e grammaticalmente perfette in italiano.
`.trim();
