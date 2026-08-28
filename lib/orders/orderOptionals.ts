/**
 * Rilevamento centralizzato degli optional d'ordine (lumino, ceri, nastro/biglietto,
 * foto-prima-posa) e pulizia delle note interne, così che VERA possa comunicarli
 * correttamente a clienti e fioristi.
 */

import { parseTicketMessageParts } from '@/lib/orders/productCustomText';

export interface OrderItemLike {
    quantity?: number | null;
    product: { id?: string | null; slug?: string | null; name?: string | null };
}

/** Delimitatore metadati B2B Stripe salvati dentro additionalInstructions. */
export const B2B_METADATA_DELIMITER = '---B2B_STRIPE_METADATA---';

/** Note riservate VERA (fatture, pagamenti) — mai esposte al fiorista. */
export const VERA_INTERNAL_DELIMITER = '---VERA_INTERNAL---';

/** Log cronologico "Aggiornato da Vera" — solo staff. */
export const VERA_AUDIT_DELIMITER = '---VERA_AUDIT---';

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
        const rawName = item.product.name?.trim() || item.product.slug?.trim() || 'Accessorio';
        // Al fiorista: "Bigliettino", non "Messaggio" (allineato al linguaggio operativo).
        const name = rawName.replace(/\bMessaggio\b/gi, 'Bigliettino');
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

function listHasCardAccessory(labels: string[]): boolean {
    return labels.some((l) => /bigliett|messaggio/i.test(l) && !/nastro/i.test(l));
}

function listHasRibbonAccessory(labels: string[]): boolean {
    return labels.some((l) => /nastro/i.test(l));
}

function isEmptyTicketMessage(ticketMessage?: string | null): boolean {
    const raw = (ticketMessage || '').trim();
    if (!raw) return true;
    return /^(nessuno|non\s*specificato|-)$/i.test(raw);
}

/**
 * Elenco accessori per WhatsApp/fiorista: include bigliettino/nastro anche se salvati
 * solo in `ticketMessage` (senza riga catalogo negli items).
 */
export function buildFloristAccessoriesDisplayList(
    items: OrderItemLike[],
    ticketMessage?: string | null
): string[] {
    const out = buildOrderOptionalsList(items);
    const { cardText, ribbonText } = parseTicketMessageParts(ticketMessage);

    if (cardText && !listHasCardAccessory(out)) {
        out.push('Biglietto con dedica');
    }
    if (ribbonText && !listHasRibbonAccessory(out)) {
        out.push('Nastro commemorativo');
    }

    if (
        !isEmptyTicketMessage(ticketMessage) &&
        !cardText &&
        !ribbonText &&
        !items.some(isMessageItem)
    ) {
        out.push('Biglietto con dedica');
    }

    return out;
}

/** Riga {{8}} / sezione Optional — "Nessun accessorio extra" solo se davvero assente tutto. */
export function formatFloristAccessoriesLine(
    items: OrderItemLike[],
    ticketMessage?: string | null,
    options?: { includePhotoBefore?: boolean; photoBeforeLabel?: string }
): string {
    const optionals = buildFloristAccessoriesDisplayList(items, ticketMessage);

    if (options?.includePhotoBefore && hasPhotoBeforeOption(items)) {
        optionals.unshift(
            options.photoBeforeLabel ?? 'Foto stato di fatto prima della consegna'
        );
    }

    if (!optionals.length) return 'Nessun accessorio extra';
    return optionals.join(', ');
}

/** Rimuove blocchi B2B / VERA internal / audit e restituisce solo la nota operativa leggibile. */
export function stripInternalNotes(notes?: string | null): string | null {
    if (!notes) return null;
    let clean = notes.split(B2B_METADATA_DELIMITER)[0];
    clean = clean.split(VERA_AUDIT_DELIMITER)[0];
    clean = clean.split(VERA_INTERNAL_DELIMITER)[0];
    clean = clean.trim();
    return clean || null;
}