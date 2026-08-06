/** Codici categoria social FloreMoria.
 * Regola primaria: nessun dato ordine reale nei post (niente nome/cognome/foto defunto — solo fiori).
 */
export type SocialProofCategoryCode = 'FF' | 'FT' | 'FA' | 'FP';

export interface SocialProofCopy {
  category: SocialProofCategoryCode;
  copy: string;
  hashtags: string[];
}

const HASHTAGS_BY_CATEGORY: Record<SocialProofCategoryCode, string[]> = {
  FF: ['floremoria', 'omaggiofloreale', 'quietluxury', 'curadelservizio'],
  FT: ['floremoria', 'fiorisulletombe', 'memoriaecura', 'quietluxury'],
  FA: ['floremoria', 'piccoliamici', 'gestidicura', 'quietluxury'],
  FP: ['floremoria', 'dettaglifloreali', 'curadelservizio', 'quietluxury'],
};

/**
 * Varianti per categoria: Meta sopprime i post ripetuti identici (reach ~0).
 * Si ruota per giorno Europe/Rome + categoria.
 */
const COPY_VARIANTS: Record<SocialProofCategoryCode, string[]> = {
  FF: [
    [
      'Un gesto di cura e rispetto, portato con discrezione.',
      'La nostra composizione floreale è stata posata con attenzione e dignità,',
      'per onorare un momento che chiede sobrietà ed eleganza.',
      'FloreMoria - eccellenza nel servizio di omaggio floreale.',
    ].join('\n'),
    [
      'Nel momento del commiato, la bellezza offre un conforto silenzioso.',
      'Composizione curata e posata con rispetto,',
      'per accompagnare un addio con dignità e presenza.',
      'FloreMoria - quando le parole mancano, resta un gesto.',
    ].join('\n'),
    [
      'Onorare chi abbiamo amato è un atto di pura bellezza.',
      'Un omaggio floreale discreto, realizzato e consegnato con cura,',
      'per chi merita silenzio, eleganza e attenzione.',
      'FloreMoria - presenza testimoniata, non solo fiori.',
    ].join('\n'),
  ],
  FT: [
    [
      'La bellezza di un ricordo, curata nei dettagli.',
      'Composizione floreale fresca e curata, posata con la massima attenzione',
      'per accompagnare un gesto di vicinanza e memoria.',
      'FloreMoria - cura, precisione e rispetto in ogni consegna.',
    ].join('\n'),
    [
      'Ci sono luoghi del cuore che visitiamo in silenzio.',
      'Un pensiero floreale posato sulla tomba con discrezione e rispetto,',
      'per chi non può esserci di persona.',
      'FloreMoria - la presenza delegata, testimoniata dalla foto.',
    ].join('\n'),
    [
      'Mantenere viva la memoria è un atto d\'amore che si nutre di gesti.',
      'Fiori freschi, posa curata, foto di conferma:',
      'così il ricordo resta vicino anche da lontano.',
      'FloreMoria - memoria e cura, senza urgenza né spettacolo.',
    ].join('\n'),
    [
      'Un gesto di vicinanza che parla senza alzare la voce.',
      'Composizione fresca posata con precisione sul luogo del ricordo,',
      'per chi vuole esserci, anche a distanza.',
      'FloreMoria - quiet luxury floreale al servizio della memoria.',
    ].join('\n'),
  ],
  FA: [
    [
      'Un pensiero delicato, consegnato con tenerezza.',
      'Composizione floreale realizzata con cura artigianale,',
      'per un gesto di affetto che parla con dolcezza.',
      'FloreMoria - Piccoli Amici, grande cura del dettaglio.',
    ].join('\n'),
    [
      'Anche i legami più piccoli meritano un gesto dignitoso.',
      'Un omaggio floreale sobrio e curato,',
      'per ricordare con dolcezza chi ha condiviso la vita di casa.',
      'FloreMoria - rispetto e tenerezza, senza enfasi.',
    ].join('\n'),
  ],
  FP: [
    [
      'Dettagli che fanno la differenza.',
      'Un accessorio floreale posato con precisione e cura,',
      'per completare un servizio curato fino all\'ultimo gesto.',
      'FloreMoria - eccellenza operativa e attenzione al dettaglio.',
    ].join('\n'),
    [
      'La cura si vede nei particolari.',
      'Un dettaglio floreale disposto con attenzione,',
      'per chi cerca un servizio preciso, discreto e completo.',
      'FloreMoria - ogni gesto conta, anche il più piccolo.',
    ].join('\n'),
  ],
};

function romeDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function pickVariantIndex(category: SocialProofCategoryCode, salt = ''): number {
  const variants = COPY_VARIANTS[category];
  const key = `${romeDayKey()}|${category}|${salt}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % variants.length;
}

export function buildSocialProofCopy(
  category: SocialProofCategoryCode,
  options?: { salt?: string }
): SocialProofCopy {
  const variants = COPY_VARIANTS[category];
  const idx = pickVariantIndex(category, options?.salt || '');
  return {
    category,
    copy: variants[idx]!,
    hashtags: [...HASHTAGS_BY_CATEGORY[category]],
  };
}

export function coerceSocialCategoryCode(value?: string | null): SocialProofCategoryCode {
  const v = String(value || '').toUpperCase().trim();
  if (v === 'FF' || v === 'FT' || v === 'FA' || v === 'FP') {
    return v;
  }
  return 'FP';
}

/** Mappa slug catalogo interno → codice social (FF / FT / FA / FP). */
export function mapCatalogSlugToSocialCode(
  slug?: string | null
): SocialProofCategoryCode {
  switch (slug) {
    case 'funerale':
      return 'FF';
    case 'cimitero':
      return 'FT';
    case 'animali':
      return 'FA';
    default:
      return 'FP';
  }
}

/** Deriva la categoria social dominante da righe ordine (senza nomi o dediche). */
export function resolveSocialCategoryFromProductSlugs(
  slugs: Array<string | null | undefined>
): SocialProofCategoryCode {
  const priority: SocialProofCategoryCode[] = ['FF', 'FT', 'FA', 'FP'];
  const mapped = slugs
    .map((s) => mapCatalogSlugToSocialCode(s))
    .filter(Boolean);

  for (const code of priority) {
    if (mapped.includes(code)) return code;
  }
  return 'FP';
}
