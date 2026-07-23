/**
 * Titoli in grassetto per il primo messaggio outbound (allineati all'header Meta
 * "Conferma Ordine FloreMoria" sul template utente).
 */
export const FIRST_OUTBOUND_TITLES = {
    customerOrderConfirm: 'Conferma Ordine FloreMoria',
    floristNewOrder: 'Nuovo Ordine FloreMoria',
} as const;

/** Prefisso *grassetto* WhatsApp free-text (non vale come HEADER Meta, ma si vede in chat). */
export function withBoldWhatsAppTitle(title: string, body: string): string {
    const trimmed = body.replace(/^\s+/, '');
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^\\*${escaped}\\*`, 'i').test(trimmed)) {
        return trimmed;
    }
    return `*${title}*\n\n${trimmed}`;
}
