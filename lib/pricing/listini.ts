/**
 * Listino ufficiale compenso fiorista — somma rigida, MAI percentuale.
 * Fonte: FLOREM_NET_Catalogo_Prezzi_e_Link.txt (prezzi vendita + compenso servizio).
 */

export type ListinoCategory = 'funerale' | 'cimitero' | 'piccoli_amici';

export interface ListinoEntry {
    /** Chiave normalizzata per matching slug/nome prodotto */
    key: string;
    label: string;
    category: ListinoCategory;
    /** Compenso fiorista in centesimi EUR */
    floristCents: number;
    /** Prezzo vendita catalogo in centesimi (riferimento, non usato per % ) */
    retailCents?: number;
}

/** Fiori sulla tomba */
export const LISTINO_CIMITERO: readonly ListinoEntry[] = [
    { key: 'ricordo-affettuoso', label: 'Ricordo Affettuoso', category: 'cimitero', floristCents: 2000, retailCents: 2999 },
    { key: 'bouquet-ricordo-affettuoso', label: 'Ricordo Affettuoso', category: 'cimitero', floristCents: 2000, retailCents: 2999 },
    { key: 'bouquet-di-rose', label: 'Bouquet di Rose', category: 'cimitero', floristCents: 2000, retailCents: 3499 },
    { key: 'bouquet-5-rose', label: 'Bouquet di Rose', category: 'cimitero', floristCents: 2000, retailCents: 3499 },
    { key: 'omaggio-speciale', label: 'Omaggio Speciale', category: 'cimitero', floristCents: 2500, retailCents: 3999 },
    { key: 'bouquet-omaggio-speciale', label: 'Omaggio Speciale', category: 'cimitero', floristCents: 2500, retailCents: 3999 },
    { key: 'tributo-eterno', label: 'Tributo Eterno', category: 'cimitero', floristCents: 3000, retailCents: 4999 },
    { key: 'bouquet-tributo-eterno', label: 'Tributo Eterno', category: 'cimitero', floristCents: 3000, retailCents: 4999 },
    { key: 'biglietto-del-ricordo', label: 'Biglietto del Ricordo', category: 'cimitero', floristCents: 0, retailCents: 249 },
    { key: 'biglietto', label: 'Biglietto del Ricordo', category: 'cimitero', floristCents: 0, retailCents: 249 },
    { key: 'messaggio', label: 'Biglietto del Ricordo', category: 'cimitero', floristCents: 0, retailCents: 249 },
    { key: 'biglietto-messaggio', label: 'Biglietto del Ricordo', category: 'cimitero', floristCents: 0, retailCents: 249 },
    { key: 'lumino-commemorativo', label: 'Lumino Commemorativo', category: 'cimitero', floristCents: 200, retailCents: 349 },
    { key: 'lumino', label: 'Lumino Commemorativo', category: 'cimitero', floristCents: 200, retailCents: 349 },
] as const;

/** Fiori per il funerale */
export const LISTINO_FUNERALE: readonly ListinoEntry[] = [
    { key: 'kalanchoe', label: 'Kalanchoe', category: 'funerale', floristCents: 2000, retailCents: 3799 },
    { key: 'kalonche', label: 'Kalanchoe', category: 'funerale', floristCents: 2000, retailCents: 3799 },
    { key: 'margherite-gerbere', label: 'Margherite/Gerbere', category: 'funerale', floristCents: 2000, retailCents: 3999 },
    { key: 'margherite', label: 'Margherite/Gerbere', category: 'funerale', floristCents: 2000, retailCents: 3999 },
    { key: 'gerbere', label: 'Margherite/Gerbere', category: 'funerale', floristCents: 2000, retailCents: 3999 },
    { key: 'bouquet-rispetto-vicinanza', label: 'Bouquet Rispetto e Vicinanza', category: 'funerale', floristCents: 2500, retailCents: 3999 },
    { key: 'bouquet-cordoglio-sincero', label: 'Bouquet Cordoglio Sincero', category: 'funerale', floristCents: 3000, retailCents: 4999 },
    { key: 'bouquet-omaggio-solenne', label: 'Bouquet Omaggio Solenne', category: 'funerale', floristCents: 4000, retailCents: 6999 },
    { key: 'bouquet-memoria-eterna', label: 'Bouquet Memoria Eterna', category: 'funerale', floristCents: 5000, retailCents: 8999 },
    { key: 'bouquet-memoria-imperituri', label: 'Bouquet Memoria Eterna', category: 'funerale', floristCents: 5000, retailCents: 8999 },
    { key: 'cuscino', label: 'Cuscino', category: 'funerale', floristCents: 7500, retailCents: 12999 },
    { key: 'cuscino-funerale', label: 'Cuscino', category: 'funerale', floristCents: 7500, retailCents: 12999 },
    { key: 'piramide', label: 'Piramide', category: 'funerale', floristCents: 8000, retailCents: 13999 },
    { key: 'copribara', label: 'Copribara', category: 'funerale', floristCents: 11000, retailCents: 18999 },
    { key: 'cuore-corona', label: 'Cuore/Corona', category: 'funerale', floristCents: 12000, retailCents: 19999 },
    { key: 'corona', label: 'Cuore/Corona', category: 'funerale', floristCents: 12000, retailCents: 19999 },
    { key: 'corona-funebre', label: 'Cuore/Corona', category: 'funerale', floristCents: 12000, retailCents: 19999 },
    { key: 'cuore', label: 'Cuore/Corona', category: 'funerale', floristCents: 12000, retailCents: 19999 },
    { key: 'nastro', label: 'Nastro', category: 'funerale', floristCents: 0, retailCents: 1499 },
    { key: 'nastro-commemorativo', label: 'Nastro', category: 'funerale', floristCents: 0, retailCents: 1499 },
    { key: 'set-ceri', label: 'Set Ceri', category: 'funerale', floristCents: 1500, retailCents: 2499 },
    { key: 'ceri', label: 'Set Ceri', category: 'funerale', floristCents: 1500, retailCents: 2499 },
    { key: 'candele', label: 'Set Ceri', category: 'funerale', floristCents: 1500, retailCents: 2499 },
] as const;

/** Piccoli Amici */
export const LISTINO_PICCOLI_AMICI: readonly ListinoEntry[] = [
    { key: 'un-raggio-di-sole', label: 'Un Raggio di Sole', category: 'piccoli_amici', floristCents: 2000, retailCents: 2999 },
    { key: 'raggio-di-sole', label: 'Un Raggio di Sole', category: 'piccoli_amici', floristCents: 2000, retailCents: 2999 },
    { key: 'sole-di-memoria', label: 'Un Raggio di Sole', category: 'piccoli_amici', floristCents: 2000, retailCents: 2999 },
    { key: 'abbraccio-verde', label: 'Abbraccio Verde', category: 'piccoli_amici', floristCents: 2500, retailCents: 3999 },
    { key: 'legame-eterno', label: 'Legame Eterno', category: 'piccoli_amici', floristCents: 3000, retailCents: 4999 },
    { key: 'battito-di-foglia', label: 'Battito di Foglia', category: 'piccoli_amici', floristCents: 4000, retailCents: 6999 },
    { key: 'anima-pura', label: 'Anima Pura', category: 'piccoli_amici', floristCents: 4500, retailCents: 8499 },
    { key: 'il-giardino-del-ponte', label: 'Il Giardino del Ponte', category: 'piccoli_amici', floristCents: 6000, retailCents: 9999 },
    { key: 'giardino-del-ponte', label: 'Il Giardino del Ponte', category: 'piccoli_amici', floristCents: 6000, retailCents: 9999 },
    { key: 'messaggio-piccoli-amici', label: 'Messaggio Piccoli Amici', category: 'piccoli_amici', floristCents: 0, retailCents: 299 },
    { key: 'biglietto-piccoli-amici', label: 'Messaggio Piccoli Amici', category: 'piccoli_amici', floristCents: 0, retailCents: 299 },
    { key: 'lumino-piccoli-amici', label: 'Lumino Piccoli Amici', category: 'piccoli_amici', floristCents: 200, retailCents: 499 },
    { key: 'set-ceri-piccoli-amici', label: 'Set Ceri Piccoli Amici', category: 'piccoli_amici', floristCents: 1000, retailCents: 1999 },
    { key: 'ceri-piccoli-amici', label: 'Set Ceri Piccoli Amici', category: 'piccoli_amici', floristCents: 1000, retailCents: 1999 },
    { key: 'nastro-piccoli-amici', label: 'Nastro Piccoli Amici', category: 'piccoli_amici', floristCents: 0, retailCents: 1499 },
    { key: 'nastro-commemorativo-piccoli-amici', label: 'Nastro Piccoli Amici', category: 'piccoli_amici', floristCents: 0, retailCents: 1499 },
] as const;

export const ALL_LISTINO_ENTRIES: readonly ListinoEntry[] = [
    ...LISTINO_FUNERALE,
    ...LISTINO_CIMITERO,
    ...LISTINO_PICCOLI_AMICI,
];

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

/** Risolve una voce listino da slug o nome prodotto (best-effort, mai %). */
export function resolveListinoEntry(
    slug?: string | null,
    name?: string | null,
    opts?: { isBouquet?: boolean | null }
): ListinoEntry | null {
    const key = normalizeProductKey(slug, name);
    const label = (name || '').toLowerCase();

    if (key) {
        const direct = listinoByKey.get(key);
        if (direct) return direct;
    }

    if (/cuore|corona/.test(label)) return listinoByKey.get('cuore-corona') ?? null;
    if (/copribara/.test(label)) return listinoByKey.get('copribara') ?? null;
    if (/piramide/.test(label)) return listinoByKey.get('piramide') ?? null;
    if (/cuscino/.test(label)) return listinoByKey.get('cuscino') ?? null;
    if (/memoria/.test(label) && /etern/.test(label)) return listinoByKey.get('bouquet-memoria-eterna') ?? null;
    if (/omaggio\s*solenne/.test(label)) return listinoByKey.get('bouquet-omaggio-solenne') ?? null;
    if (/cordoglio/.test(label)) return listinoByKey.get('bouquet-cordoglio-sincero') ?? null;
    if (/rispetto/.test(label) && /vicinanza/.test(label)) return listinoByKey.get('bouquet-rispetto-vicinanza') ?? null;
    if (/piccoli\s*amici/.test(label) && /ceri|candele/.test(label)) {
        return listinoByKey.get('set-ceri-piccoli-amici') ?? null;
    }
    if (/piccoli\s*amici/.test(label) && /nastro/.test(label)) {
        return listinoByKey.get('nastro-piccoli-amici') ?? null;
    }
    if (/piccoli\s*amici/.test(label) && /lumino/.test(label)) {
        return listinoByKey.get('lumino-piccoli-amici') ?? null;
    }
    if (/piccoli\s*amici/.test(label) && /(messaggio|bigliett)/.test(label)) {
        return listinoByKey.get('messaggio-piccoli-amici') ?? null;
    }
    if (/giardino\s*del\s*ponte/.test(label)) return listinoByKey.get('il-giardino-del-ponte') ?? null;
    if (/anima\s*pura/.test(label)) return listinoByKey.get('anima-pura') ?? null;
    if (/battito/.test(label)) return listinoByKey.get('battito-di-foglia') ?? null;
    if (/legame\s*eterno/.test(label)) return listinoByKey.get('legame-eterno') ?? null;
    if (/abbraccio\s*verde/.test(label)) return listinoByKey.get('abbraccio-verde') ?? null;
    if (/raggio\s*di\s*sole|sole\s*di\s*memoria/.test(label)) {
        return listinoByKey.get('un-raggio-di-sole') ?? null;
    }
    if (/ceri|candele/.test(label)) return listinoByKey.get('set-ceri') ?? null;
    if (/nastro/.test(label)) return listinoByKey.get('nastro-commemorativo') ?? null;
    if (/tributo/.test(label)) return listinoByKey.get('tributo-eterno') ?? null;
    if (/omaggio\s*speciale/.test(label)) return listinoByKey.get('omaggio-speciale') ?? null;
    if (/5\s*rose|bouquet\s*di\s*rose/.test(label)) return listinoByKey.get('bouquet-di-rose') ?? null;
    if (/ricordo\s*affettuoso/.test(label)) return listinoByKey.get('ricordo-affettuoso') ?? null;
    if (/lumino/.test(label) || /lumino/.test(key)) return listinoByKey.get('lumino') ?? null;
    if (/margherite|gerbere/.test(label)) return listinoByKey.get('margherite-gerbere') ?? null;
    if (/kalonche|kalanchoe/.test(label)) return listinoByKey.get('kalanchoe') ?? null;
    if (/bigliett|messaggio/.test(label) || /bigliett|messaggio/.test(key)) {
        return listinoByKey.get('biglietto-del-ricordo') ?? null;
    }

    if (key) {
        for (const entry of ALL_LISTINO_ENTRIES) {
            if (key === entry.key || key.startsWith(`${entry.key}-`) || key.includes(`-${entry.key}`)) {
                return entry;
            }
        }
    }

    // Bouquet generico non mappato → Ricordo Affettuoso (20€), non % sul retail
    if (opts?.isBouquet) {
        return listinoByKey.get('ricordo-affettuoso') ?? null;
    }

    return null;
}

export function formatFloristCompensationEur(cents: number): string {
    const euros = cents / 100;
    return `${Math.round(euros)}€`;
}

export interface OrderLineForListino {
    quantity: number;
    product: {
        slug?: string | null;
        name?: string | null;
        isBouquet?: boolean | null;
    };
}

/**
 * Somma rigida del compenso fiorista per tutte le righe ordine mappate al listino.
 */
export function sumFloristCompensationCents(lines: OrderLineForListino[]): number {
    let total = 0;
    for (const line of lines) {
        const entry = resolveListinoEntry(line.product.slug, line.product.name, {
            isBouquet: line.product.isBouquet,
        });
        if (!entry) continue;
        total += entry.floristCents * Math.max(1, line.quantity);
    }
    return total;
}

/** Blocco testo per prompt VERA (iniezione regole). */
export function buildFloristCompensationTablePromptBlock(): string {
    const lines = [
        '=== TABELLA COMPENSI FIORISTA (RIGIDA — SOMMA ARTICOLI, MAI %) ===',
        'Fonte: FLOREM_NET_Catalogo_Prezzi_e_Link.txt. Vietato stimare o usare percentuali sul retail.',
        '',
        'Fiori sulla tomba:',
        '- Ricordo Affettuoso (29,99€) → 20€',
        '- Bouquet di Rose (34,99€) → 20€',
        '- Omaggio Speciale (39,99€) → 25€',
        '- Tributo Eterno (49,99€) → 30€',
        '- Biglietto del Ricordo (2,49€) → 0€',
        '- Lumino Commemorativo (3,49€) → 2€',
        '',
        'Funerale:',
        '- Kalanchoe (37,99€) → 20€',
        '- Margherite/Gerbere (39,99€) → 20€',
        '- Bouquet Rispetto e Vicinanza (39,99€) → 25€',
        '- Bouquet Cordoglio Sincero (49,99€) → 30€',
        '- Bouquet Omaggio Solenne (69,99€) → 40€',
        '- Bouquet Memoria Eterna (89,99€) → 50€',
        '- Cuscino (129,99€) → 75€',
        '- Piramide (139,99€) → 80€',
        '- Copribara (189,99€) → 110€',
        '- Cuore/Corona (199,99€) → 120€',
        '- Nastro (14,99€) → 0€',
        '- Set Ceri (24,99€) → 15€',
        '',
        'Piccoli Amici:',
        '- Un Raggio di Sole (29,99€) → 20€',
        '- Abbraccio Verde (39,99€) → 25€',
        '- Legame Eterno (49,99€) → 30€',
        '- Battito di Foglia (69,99€) → 40€',
        '- Anima Pura (84,99€) → 45€',
        '- Il Giardino del Ponte (99,99€) → 60€',
        '- Messaggio Piccoli Amici (2,99€) → 0€',
        '- Lumino Piccoli Amici (4,99€) → 2€',
        '- Set Ceri Piccoli Amici (19,99€) → 10€',
        '- Nastro Piccoli Amici (14,99€) → 0€',
        '',
        'Più prodotti nello stesso ordine → SOMMA esatta dei compensi riga per riga.',
    ];
    return lines.join('\n');
}
