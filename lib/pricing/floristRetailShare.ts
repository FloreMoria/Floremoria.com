/**
 * Tabella prezzi e margini FloreMoria — fonte: `Tabella prezzi e margini FloreMoria.csv`.
 * Compenso fiorista = 65% del prezzo vendita, tranne accessori a 0 (Lumino, Nastro, Biglietto).
 */
export const FLORIST_RETAIL_SHARE = 0.65;

/** Accessori a compenso zero secondo la tabella ufficiale. */
const ZERO_COMPENSO_KEYS =
    /^(lumino|nastro|bigliett|messaggio)(-|$)|(^|-)(lumino|nastro|bigliett|messaggio)(-|$)/i;

const TABELLA_BY_KEY: Record<string, number> = {
    'bouquet-tradizione': 3250,
    'corona-funebre': 9750,
    'corona': 9750,
    'cuscino-funerale': 6500,
    'cuscino': 6500,
    'fiori-per-loculo': 2600,
    'lumino': 0,
    'nastro': 0,
    'biglietto': 0,
    'cesto-di-gigli': 5200,
    'mazzo-stagionale': 2925,
};

function normalizeKey(slug?: string | null, name?: string | null): string {
    const raw = (slug || name || '').toLowerCase().trim();
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function isZeroFloristCompensoAccessory(
    slug?: string | null,
    name?: string | null
): boolean {
    const key = normalizeKey(slug, name);
    const label = `${slug || ''} ${name || ''}`.toLowerCase();
    return ZERO_COMPENSO_KEYS.test(key) || /lumino|nastro|bigliett|messaggio/.test(label);
}

/**
 * Compenso in centesimi da tabella / regola 65%.
 * Perché: i 30€ su Anima Pura erano un mapping listino inventato; la tabella ufficiale usa % sul retail.
 */
export function resolveFloristCompensationCentsFromRetail(input: {
    slug?: string | null;
    name?: string | null;
    basePriceCents?: number | null;
}): number | null {
    const key = normalizeKey(input.slug, input.name);
    if (key && TABELLA_BY_KEY[key] !== undefined) {
        return TABELLA_BY_KEY[key];
    }

    if (isZeroFloristCompensoAccessory(input.slug, input.name)) {
        return 0;
    }

    // Match soft su nomi tabella
    const label = (input.name || '').toLowerCase();
    if (/corona/.test(label)) return TABELLA_BY_KEY['corona-funebre'];
    if (/cuscino/.test(label)) return TABELLA_BY_KEY['cuscino-funerale'];
    if (/loculo/.test(label)) return TABELLA_BY_KEY['fiori-per-loculo'];
    if (/gigli/.test(label)) return TABELLA_BY_KEY['cesto-di-gigli'];
    if (/stagionale/.test(label)) return TABELLA_BY_KEY['mazzo-stagionale'];
    if (/tradizione/.test(label)) return TABELLA_BY_KEY['bouquet-tradizione'];

    const retail = input.basePriceCents;
    if (retail != null && retail > 0) {
        return Math.round(retail * FLORIST_RETAIL_SHARE);
    }

    return null;
}
