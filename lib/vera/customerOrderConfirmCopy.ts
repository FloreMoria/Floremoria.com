import { clampWarmThoughtForTemplate } from '@/lib/vera/clampWarmThought';
import { META_TEMPLATE_LIMITS } from '@/lib/whatsapp/metaTemplateLimits';

/** Call-to-action invito a rispondere (obbligatoria nel primo messaggio cliente). */
export const CUSTOMER_CONFIRM_CTA = 'Scriva OK qui per qualsiasi richiesta 🌹';

/**
 * Testo predefinito per {{3}} nel template conferma ordine.
 * Caldo, rassicurante, con invito esplicito a rispondere.
 */
export function buildDefaultCustomerConfirmWarmSlot(): string {
    return clampWarmThoughtForTemplate(
        `Stiamo seguendo ogni dettaglio con cura e Le invieremo la foto della posa appena completata. ${CUSTOMER_CONFIRM_CTA}`
    );
}

/**
 * Normalizza il pensiero caloroso Gemini per lo slot {{3}}:
 * mantiene tono empatico, CTA finale, niente saluti duplicati.
 */
export function finalizeCustomerConfirmWarmSlot(raw: string): string {
    let text = clampWarmThoughtForTemplate(raw);
    if (!text) return buildDefaultCustomerConfirmWarmSlot();

    const hasCta = /scriva\s+ok|rispond(a|ere)|qui\s+per/i.test(text);
    if (!hasCta) {
        const withCta = `${text.replace(/[.!?…\s]+$/, '')}. ${CUSTOMER_CONFIRM_CTA}`;
        text = clampWarmThoughtForTemplate(withCta);
    }

    return text || buildDefaultCustomerConfirmWarmSlot();
}

export const MAX_CUSTOMER_CONFIRM_WARM_CHARS = META_TEMPLATE_LIMITS.warmThought;
