/** Codici categoria social Futuria (nessun dato ordine reale nei post). */
export type SocialProofCategoryCode = 'FF' | 'FT' | 'FA' | 'FP';

export interface SocialProofCopy {
  category: SocialProofCategoryCode;
  copy: string;
  hashtags: string[];
}

const COPY_BY_CATEGORY: Record<SocialProofCategoryCode, Omit<SocialProofCopy, 'category'>> = {
  FF: {
    copy: [
      'Un gesto di cura e rispetto, portato con discrezione.',
      'La nostra composizione floreale è stata posata con attenzione e dignità,',
      'per onorare un momento che chiede sobrietà ed eleganza.',
      'FloreMoria - eccellenza nel servizio di omaggio floreale.',
    ].join('\n'),
    hashtags: ['floremoria', 'omaggiofloreale', 'quietluxury', 'curadelservizio'],
  },
  FT: {
    copy: [
      'La bellezza di un ricordo, curata nei dettagli.',
      'Composizione floreale fresca e curata, posata con la massima attenzione',
      'per accompagnare un gesto di vicinanza e memoria.',
      'FloreMoria - cura, precisione e rispetto in ogni consegna.',
    ].join('\n'),
    hashtags: ['floremoria', 'fiorisulletombe', 'memoriaecura', 'quietluxury'],
  },
  FA: {
    copy: [
      'Un pensiero delicato, consegnato con tenerezza.',
      'Composizione floreale realizzata con cura artigianale,',
      'per un gesto di affetto che parla con dolcezza.',
      'FloreMoria - Piccoli Amici, grande cura del dettaglio.',
    ].join('\n'),
    hashtags: ['floremoria', 'piccoliamici', 'gestidicura', 'quietluxury'],
  },
  FP: {
    copy: [
      'Dettagli che fanno la differenza.',
      'Un accessorio floreale posato con precisione e cura,',
      'per completare un servizio curato fino all\'ultimo gesto.',
      'FloreMoria - eccellenza operativa e attenzione al dettaglio.',
    ].join('\n'),
    hashtags: ['floremoria', 'dettaglifloreali', 'curadelservizio', 'quietluxury'],
  },
};

export function buildSocialProofCopy(category: SocialProofCategoryCode): SocialProofCopy {
  const template = COPY_BY_CATEGORY[category];
  return { category, copy: template.copy, hashtags: [...template.hashtags] };
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
