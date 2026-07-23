import { META_TEMPLATE_LIMITS } from '@/lib/whatsapp/metaTemplateLimits';

/**
 * Invito a rispondere per aprire la finestra conversazione Meta (24h).
 * Mantenerlo corto: con warm lead deve stare nello slot {{3}} (~92 caratteri Meta).
 */
export const CUSTOMER_CONFIRM_CTA = 'Scriva qui per qualsiasi richiesta.';

/** Slot {{3}} nel template Meta approvato — limite conservativo (Meta tronca prima di 115). */
export const MAX_CUSTOMER_CONFIRM_SLOT3_CHARS = META_TEMPLATE_LIMITS.warmThought;

/**
 * Testo di riferimento conferma ordine (allineare a Meta BM se si ri-approva il template).
 * Su Meta lo slot {{3}} porta warm + CTA; il resto è fisso sul template approvato.
 */
export const CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL = `Gentile {{1}},
La ringraziamo per aver scelto FloreMoria.
Le confermiamo che il nostro partner di fiducia di zona ha preso in carico il Suo omaggio nel ricordo di {{2}}.

{{3}}
Seguiremo ogni passo con la massima cura e restiamo a sua disposizione.

FloreMoria Staff 🌹`;

const DEFAULT_WARM_LEAD = 'Le invieremo la foto della posa appena completata.';

/** Articoli/preposizioni: se la frase finisce così dopo un taglio, è spezzata. */
const INCOMPLETE_TAIL =
    /\b(della|delle|degli|dello|dell|del|di|da|in|su|per|con|tra|fra|la|il|lo|le|gli|un|una|uno|che|e|ed|o|a|al|alla|ai|alle)\.?$/i;

function stripWarmLead(raw: string): string {
    return raw
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^(gentile|egregi[oa]|caro|carissim[oa]|buongiorno|buonasera)\s+[^,.!?]+[,!]?\s*/i, '')
        .replace(/\bci\s+invieremo\b/gi, 'Le invieremo')
        .replace(/scriva\s+(qui|ok).*$/i, '')
        .replace(/rispond(a|ere)\s+(ok|qui).*$/i, '')
        .replace(/🌹/g, '')
        .trim();
}

function looksCompleteWarmLead(lead: string): boolean {
    const t = lead.trim();
    if (t.length < 18) return false;
    if (!/[.!?…]$/.test(t)) return false;
    if (INCOMPLETE_TAIL.test(t.replace(/[.!?…]+$/, ''))) return false;
    if (/\bdella\.$/i.test(t) || /\bdel\.$/i.test(t) || /\bdi\.$/i.test(t)) return false;
    return true;
}

/**
 * Compone {{3}}: frase completa + CTA corta.
 * Perché: con CTA lunga restavano ~30 caratteri → Gemini veniva tagliato in "foto della."
 */
export function composeCustomerConfirmSlot3(warmLead?: string | null): string {
    const cta = CUSTOMER_CONFIRM_CTA;
    const suffix = ` ${cta}`;
    const max = MAX_CUSTOMER_CONFIRM_SLOT3_CHARS;
    const maxLeadLen = Math.max(20, max - suffix.length);

    let lead = stripWarmLead(warmLead || '');
    if (!looksCompleteWarmLead(lead) || lead.length > maxLeadLen) {
        if (DEFAULT_WARM_LEAD.length <= maxLeadLen) {
            lead = DEFAULT_WARM_LEAD;
        } else if (looksCompleteWarmLead(lead) && lead.length <= maxLeadLen) {
            // keep
        } else {
            return cta.length <= max ? cta : cta.slice(0, max);
        }
    }

    if (!/[.!?…]$/.test(lead)) lead += '.';

    const composed = `${lead}${suffix}`;
    if (composed.length <= max && looksCompleteWarmLead(lead)) return composed;

    const withDefault = `${DEFAULT_WARM_LEAD}${suffix}`;
    if (withDefault.length <= max) return withDefault;
    return cta.length <= max ? cta : cta.slice(0, max);
}

export function buildDefaultCustomerConfirmWarmSlot(): string {
    return composeCustomerConfirmSlot3(null);
}

/** Normalizza output Gemini per lo slot {{3}}. */
export function finalizeCustomerConfirmWarmSlot(raw: string): string {
    return composeCustomerConfirmSlot3(raw);
}

export const MAX_CUSTOMER_CONFIRM_WARM_CHARS = META_TEMPLATE_LIMITS.warmThought;

/**
 * Nome per template: usa il primo token inserito dall'utente (anche corto, es. "ss").
 * Fallback "Utente" solo se assente — il saluto "Gentile [nome]" resta personale.
 */
export function resolveSafeBuyerFirstName(raw?: string | null): string {
    const cleaned = (raw || '')
        .trim()
        .replace(/^gentile\s+/i, '')
        .split(/\s+/)[0]
        ?.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’-]/g, '') || '';

    if (!cleaned) return 'Utente';
    if (cleaned.length <= 2) return cleaned;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
