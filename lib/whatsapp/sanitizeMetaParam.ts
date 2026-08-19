/**
 * Utility di sanitizzazione parametri per i template Meta WhatsApp.
 * Modulo privo di dipendenze esterne per evitare dipendenze circolari al build time.
 */

/** Meta rifiuta newline/tab nei parametri body (errori #132000 / #132018). */
export function sanitizeMetaTemplateParam(value: string, maxLen = 900): string {
    return value
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, maxLen);
}
