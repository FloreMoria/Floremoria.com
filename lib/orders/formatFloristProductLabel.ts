/**
 * Etichetta prodotto leggibile per WhatsApp fiorista (Punto A).
 * Perché: al fiorista serve il tipo operativo (Bouquet / Cuore / Pianta…), non il nome commerciale lungo.
 */

const SPECIFIC_TYPES = ['Copribara', 'Piramide', 'Cuscino', 'Corona', 'Cuore'] as const;

export type FloristProductInput = {
    name?: string | null;
    slug?: string | null;
    isBouquet?: boolean | null;
};

function normalizeSpaces(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

/** Estrae il nome pianta da etichette tipo "Kalonchoe (pianta in vaso)". */
function extractPlantName(name: string): string {
    return normalizeSpaces(
        name
            .replace(/\(\s*pianta\s+in\s+vaso\s*\)/gi, '')
            .replace(/\bpianta\s+in\s+vaso\b/gi, '')
            .replace(/[()]/g, ' ')
    );
}

/**
 * Formatta un singolo prodotto per il campo "Prodotto" del messaggio fiorista.
 */
export function formatFloristProductLabel(product: FloristProductInput): string {
    const name = normalizeSpaces(product.name || '');
    const slug = normalizeSpaces(product.slug || '').toLowerCase();
    const haystack = `${name} ${slug}`.toLowerCase();

    if (!name && !slug) return 'Composizione floreale';

    // 1) Pianta in vaso → "Pianta in vaso - {nome}"
    if (/pianta\s+in\s+vaso/i.test(name) || /pianta-in-vaso|kalonch|margherite|gerbere/.test(slug)) {
        if (/pianta\s+in\s+vaso/i.test(name) || /kalonch|margherite|gerbere/.test(haystack)) {
            const plant = extractPlantName(name) || name || 'Pianta';
            return `Pianta in vaso - ${plant}`;
        }
    }

    // 2) Cuore / Corona come SKU unico
    if (/cuore\s*\/\s*corona/i.test(name) || slug === 'cuore-corona') {
        return 'Cuore / Corona';
    }

    // 3) Tipi funerari specifici
    for (const type of SPECIFIC_TYPES) {
        if (new RegExp(`\\b${type}\\b`, 'i').test(name) || slug === type.toLowerCase()) {
            return type;
        }
    }

    // 4) Bouquet (nome commerciale lungo → solo "Bouquet")
    if (
        /^bouquet\b/i.test(name) ||
        /\bbouquet\b/i.test(slug) ||
        product.isBouquet === true
    ) {
        // Evita di collassare piante/tipi già gestiti sopra; qui restano i bouquet e omaggi isBouquet.
        if (!SPECIFIC_TYPES.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(name))) {
            return 'Bouquet';
        }
    }

    return name || 'Composizione floreale';
}

/**
 * Formatta i prodotti principali dell'ordine (esclude accessori tipici).
 * Più omaggi → elenco separato da virgola.
 */
export function formatFloristOrderProductsLabel(
    items: Array<{ quantity?: number | null; product: FloristProductInput }>
): string {
    const mains = items.filter((item) => {
        const label = `${item.product.slug || ''} ${item.product.name || ''}`.toLowerCase();
        if (/lumino|bigliett|messaggio|nastro|foto-stato|set-ceri|\bceri\b/.test(label)) {
            return false;
        }
        return true;
    });

    const source = mains.length ? mains : items;
    if (!source.length) return 'Composizione floreale';

    return source
        .map((item) => {
            const label = formatFloristProductLabel(item.product);
            const qty = item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : '';
            return `${label}${qty}`;
        })
        .join(', ');
}
