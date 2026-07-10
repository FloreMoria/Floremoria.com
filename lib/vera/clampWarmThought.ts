/** Limite conservativo per {{3}} nel template Meta conferma ordine (evita troncamenti lato WhatsApp). */
export const MAX_WARM_THOUGHT_TEMPLATE_CHARS = 110;

/**
 * Normalizza il pensiero caloroso per il template: niente doppi saluti, frase completa, lunghezza sicura.
 */
export function clampWarmThoughtForTemplate(raw: string): string {
    let text = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!text) return '';

    // Il template apre già con "Gentile {{1}}…" — togli saluti e nome ripetuti.
    text = text.replace(/^(gentile|egregi[oa]|caro|carissim[oa]|buongiorno|buonasera)\s+[^,.!?]+[,!]?\s*/i, '');
    text = text.replace(/^(gentile|egregi[oa]|caro|carissim[oa])\s+/i, '');

    if (text.length > MAX_WARM_THOUGHT_TEMPLATE_CHARS) {
        let cut = text.slice(0, MAX_WARM_THOUGHT_TEMPLATE_CHARS);
        const lastSpace = cut.lastIndexOf(' ');
        if (lastSpace > 50) cut = cut.slice(0, lastSpace);
        cut = cut.replace(/[,;:\s]+$/, '');
        if (!/[.!?…]$/.test(cut)) cut += '.';
        text = cut;
    }

    return text;
}
