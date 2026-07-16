/**
 * Rilevamento centralizzato degli optional d'ordine (lumino, ceri, nastro/biglietto,
 * foto-prima-posa) e pulizia delle note interne, così che VERA possa comunicarli
 * correttamente a clienti e fioristi.
 */

export interface OrderItemLike {
    quantity?: number | null;
    product: { id?: string | null; slug?: string | null; name?: string | null };
}

/** Delimitatore metadati B2B Stripe salvati dentro additionalInstructions. */
export const B2B_METADATA_DELIMITER = '---B2B_STRIPE_METADATA---';

const PHOTO_BEFORE_IDS = new Set(['florem-foto-stato-prima']);
const PHOTO_BEFORE_SLUGS = new Set(['foto-stato-prima-consegna']);
const LUMINO_PATTERN = /lumino|set-ceri|\bceri\b|candel/i;
const MESSAGE_ITEM_PATTERN = /messaggio|bigliett|nastro/i;

function itemLabel(item: OrderItemLike): string {
    return `${item.product.slug || ''} ${item.product.name || ''}`.toLowerCase();
}

/** Opzione "Foto prima della posa" acquistata. */
export function isPhotoBeforeItem(item: OrderItemLike): boolean {
    const id = item.product.id ?? '';
    const slug = item.product.slug ?? '';
    return PHOTO_BEFORE_IDS.has(id) || PHOTO_BEFORE_SLUGS.has(slug);
}

export function hasPhotoBeforeOption(items: OrderItemLike[]): boolean {
    return items.some(isPhotoBeforeItem);
}

/** Lumino / ceri / candele. */
export function isLuminoItem(item: OrderItemLike): boolean {
    return LUMINO_PATTERN.test(itemLabel(item));
}

export function hasLuminoOption(items: OrderItemLike[]): boolean {
    return items.some(isLuminoItem);
}

/** Biglietto / messaggio / nastro commemorativo (testo inciso). */
export function isMessageItem(item: OrderItemLike): boolean {
    return MESSAGE_ITEM_PATTERN.test(itemLabel(item));
}

/**
 * Elenco leggibile degli optional accessori (esclude il bouquet principale e
 * l'opzione foto-prima, gestita a parte con istruzione dedicata).
 */
export function buildOrderOptionalsList(items: OrderItemLike[]): string[] {
    const out: string[] = [];
    for (const item of items) {
        if (isPhotoBeforeItem(item)) continue;
        if (!isLuminoItem(item) && !isMessageItem(item)) continue;
        const name = item.product.name?.trim() || item.product.slug?.trim() || 'Accessorio';
        const qty = item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : '';
        out.push(`${name}${qty}`);
    }
    return out;
}

export function orderHasBigliettinoOrRibbon(
    items: OrderItemLike[],
    ticketMessage?: string | null
): boolean {
    if (ticketMessage?.trim()) return true;
    return items.some(isMessageItem);
}

/** Rimuove il blocco metadati B2B e restituisce solo la nota utente/fiorista leggibile. */
export function stripInternalNotes(notes?: string | null): string | null {
    if (!notes) return null;
    const clean = notes.split(B2B_METADATA_DELIMITER)[0].trim();
    return clean || null;
}
