/**
 * Listini ufficiali compenso fiorista (somma rigida, non percentuale).
 * Fonte: "Fiori Funerale-Listino addobbi floreali funebri.csv" e "Fiori Tombe-Tabella 1.csv"
 */

export type ListinoCategory = 'funerale' | 'cimitero';

export interface ListinoEntry {
    /** Chiave normalizzata per matching slug/nome prodotto */
    key: string;
    label: string;
    category: ListinoCategory;
    /** Compenso fiorista in centesimi EUR */
    floristCents: number;
}

/** Addobbi funebri — listino ufficiale fiorista */
export const LISTINO_FUNERALE: readonly ListinoEntry[] = [
    { key: 'cuore-corona', label: 'Corona o Cuore', category: 'funerale', floristCents: 11500 },
    { key: 'corona', label: 'Corona o Cuore', category: 'funerale', floristCents: 11500 },
    { key: 'cuore', label: 'Corona o Cuore', category: 'funerale', floristCents: 11500 },
    { key: 'copribara', label: 'Copribara', category: 'funerale', floristCents: 11000 },
    { key: 'piramide', label: 'Piramide', category: 'funerale', floristCents: 8000 },
    { key: 'cuscino', label: 'Cuscino', category: 'funerale', floristCents: 7500 },
    { key: 'bouquet-memoria-imperituri', label: 'Bouquet Memoria Eterna', category: 'funerale', floristCents: 5000 },
    { key: 'bouquet-memoria-eterna', label: 'Bouquet Memoria Eterna', category: 'funerale', floristCents: 5000 },
    { key: 'bouquet-omaggio-solenne', label: 'Bouquet Omaggio Solenne', category: 'funerale', floristCents: 4000 },
    { key: 'bouquet-cordoglio-sincero', label: 'Bouquet Cordoglio Sincero', category: 'funerale', floristCents: 3000 },
    { key: 'bouquet-rispetto-vicinanza', label: 'Bouquet Rispetto e Vicinanza', category: 'funerale', floristCents: 2500 },
    { key: 'set-ceri', label: 'Ceri / Candele', category: 'funerale', floristCents: 1000 },
    { key: 'ceri', label: 'Ceri / Candele', category: 'funerale', floristCents: 1000 },
    { key: 'candele', label: 'Ceri / Candele', category: 'funerale', floristCents: 1000 },
    { key: 'nastro-commemorativo', label: 'Nastro commemorativo', category: 'funerale', floristCents: 0 },
    { key: 'nastro', label: 'Nastro commemorativo', category: 'funerale', floristCents: 0 },
] as const;

/** Tombe — listino ufficiale fiorista */
export const LISTINO_CIMITERO: readonly ListinoEntry[] = [
    { key: 'bouquet-tributo-eterno', label: 'Tributo Eterno', category: 'cimitero', floristCents: 3000 },
    { key: 'tributo-eterno', label: 'Tributo Eterno', category: 'cimitero', floristCents: 3000 },
    { key: 'bouquet-omaggio-speciale', label: 'Omaggio Speciale', category: 'cimitero', floristCents: 2500 },
    { key: 'omaggio-speciale', label: 'Omaggio Speciale', category: 'cimitero', floristCents: 2500 },
    { key: 'bouquet-di-rose', label: 'Bouquet 5 rose', category: 'cimitero', floristCents: 2000 },
    { key: 'bouquet-5-rose', label: 'Bouquet 5 rose', category: 'cimitero', floristCents: 2000 },
    { key: 'bouquet-ricordo-affettuoso', label: 'Ricordo Affettuoso', category: 'cimitero', floristCents: 2000 },
    { key: 'ricordo-affettuoso', label: 'Ricordo Affettuoso', category: 'cimitero', floristCents: 2000 },
    { key: 'lumino', label: 'Lumino', category: 'cimitero', floristCents: 200 },
    { key: 'messaggio', label: 'Messaggio', category: 'cimitero', floristCents: 0 },
] as const;

export const ALL_LISTINO_ENTRIES: readonly ListinoEntry[] = [...LISTINO_FUNERALE, ...LISTINO_CIMITERO];

const listinoByKey = new Map<string, ListinoEntry>();
for (const entry of ALL_LISTINO_ENTRIES) {
    if (!listinoByKey.has(entry.key)) listinoByKey.set(entry.key, entry);
}

function normalizeProductKey(slug?: string | null, name?: string | null): string {
    const raw = (slug || name || '').toLowerCase().trim();
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Risolve una voce listino da slug o nome prodotto (best-effort). */
export function resolveListinoEntry(
    slug?: string | null,
    name?: string | null
): ListinoEntry | null {
    const key = normalizeProductKey(slug, name);
    if (!key) return null;

    const direct = listinoByKey.get(key);
    if (direct) return direct;

    for (const entry of ALL_LISTINO_ENTRIES) {
        if (key.includes(entry.key) || entry.key.includes(key)) return entry;
    }

    const label = (name || '').toLowerCase();
    if (/cuore|corona/.test(label)) return listinoByKey.get('cuore-corona') ?? null;
    if (/copribara/.test(label)) return listinoByKey.get('copribara') ?? null;
    if (/piramide/.test(label)) return listinoByKey.get('piramide') ?? null;
    if (/cuscino/.test(label)) return listinoByKey.get('cuscino') ?? null;
    if (/memoria/.test(label) && /etern/.test(label)) return listinoByKey.get('bouquet-memoria-imperituri') ?? null;
    if (/omaggio\s*solenne/.test(label)) return listinoByKey.get('bouquet-omaggio-solenne') ?? null;
    if (/cordoglio/.test(label)) return listinoByKey.get('bouquet-cordoglio-sincero') ?? null;
    if (/rispetto/.test(label) && /vicinanza/.test(label)) return listinoByKey.get('bouquet-rispetto-vicinanza') ?? null;
    if (/ceri|candele/.test(label)) return listinoByKey.get('set-ceri') ?? null;
    if (/nastro/.test(label)) return listinoByKey.get('nastro-commemorativo') ?? null;
    if (/tributo/.test(label)) return listinoByKey.get('bouquet-tributo-eterno') ?? null;
    if (/omaggio\s*speciale/.test(label)) return listinoByKey.get('bouquet-omaggio-speciale') ?? null;
    if (/5\s*rose|bouquet\s*di\s*rose/.test(label)) return listinoByKey.get('bouquet-di-rose') ?? null;
    if (/ricordo\s*affettuoso/.test(label)) return listinoByKey.get('bouquet-ricordo-affettuoso') ?? null;
    if (/lumino/.test(label)) return listinoByKey.get('lumino') ?? null;
    if (/messaggio|bigliett/.test(label)) return listinoByKey.get('messaggio') ?? null;

    return null;
}

export function formatFloristCompensationEur(cents: number): string {
    const euros = cents / 100;
    return `${euros.toFixed(2).replace('.', ',')}€`;
}

export interface OrderLineForListino {
    quantity: number;
    product: { slug?: string | null; name?: string | null; isBouquet?: boolean | null };
}

/**
 * Somma rigida del compenso fiorista per tutte le righe ordine mappate al listino.
 * Righe non mappate → 0€ (log warning in calculateFloristCompensation).
 */
export function sumFloristCompensationCents(lines: OrderLineForListino[]): number {
    let total = 0;
    for (const line of lines) {
        const entry = resolveListinoEntry(line.product.slug, line.product.name);
        if (!entry) continue;
        total += entry.floristCents * Math.max(1, line.quantity);
    }
    return total;
}
