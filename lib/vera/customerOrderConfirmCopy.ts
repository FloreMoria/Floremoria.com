import { sanitizeMetaTemplateParam } from '@/lib/whatsapp/sanitizeMetaParam';
import { META_TEMPLATE_LIMITS } from '@/lib/whatsapp/metaTemplateLimits';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';

/**
 * Invito a rispondere per aprire la finestra conversazione Meta (24h).
 * Usato solo nel warm thought auto-generato (slot {{3}}), non nel body canonico.
 */
export const CUSTOMER_CONFIRM_CTA = 'Scriva qui per qualsiasi richiesta.';

/** Slot {{3}} warm auto — limite conservativo (Meta tronca prima di ~115). */
export const MAX_CUSTOMER_CONFIRM_SLOT3_CHARS = META_TEMPLATE_LIMITS.warmThought;

/** Messaggio staff opzionale in {{3}} — più largo del warm auto. */
export const MAX_CUSTOMER_CONFIRM_STAFF_MESSAGE_CHARS = META_TEMPLATE_LIMITS.staffNotes;

/**
 * Testo di riferimento conferma ordine — allineato al template Meta live a 3 variabili.
 * {{1}} cliente · {{2}} defunto · {{3}} messaggio staff/Vera (o spazio se assente).
 */
export const CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL = `Gentile {{1}},
La ringraziamo per aver scelto FloreMoria. Le confermiamo abbiamo preso in carico il Suo omaggio floreale nel ricordo di {{2}}.
Seguiremo e l'avviseremo ad ogni passo con la massima cura e restiamo a sua disposizione.
{{3}}
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
 * Compone il warm thought auto (frase + CTA corta) per lo slot {{3}}.
 * Perché: Gemini può troncare; CTA corta lascia spazio a una frase completa.
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
 * {{3}} per Meta: messaggio staff/Vera, oppure un singolo spazio se assente.
 * Meta rifiuta parametri body vuoti (#132000); lo spazio evita errori senza creare una riga vuota anomala.
 * Nota: i newline nei parametri Meta non sono ammessi — la riga vuota strutturale è già nel body template intorno a {{3}}.
 */
export function resolveCustomerConfirmSlot3(raw?: string | null): string {
    const cleaned = sanitizeMetaTemplateParam(
        raw ?? '',
        MAX_CUSTOMER_CONFIRM_STAFF_MESSAGE_CHARS
    );
    return cleaned || ' ';
}

/**
 * Fallback free-text (finestra 24h) — stesso copy ufficiale Meta, un solo messaggio.
 * Se {{3}} è solo spazio, collassa la riga vuota.
 */
export function renderCustomerOrderConfirmFreeText(input: {
    buyerFirstName?: string | null;
    deceasedName?: string | null;
    staffMessage?: string | null;
}): string {
    const buyer = resolveSafeBuyerFirstName(input.buyerFirstName);
    const deceased = formatDeceasedName(input.deceasedName, 'chi ama') || 'chi ama';
    const slot3 = resolveCustomerConfirmSlot3(input.staffMessage);
    const slot3Visible = slot3.trim();

    let text = CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL.replace(/\{\{1\}\}/g, buyer)
        .replace(/\{\{2\}\}/g, deceased)
        .replace(/\{\{3\}\}/g, slot3Visible);

    if (!slot3Visible) {
        text = text.replace(/\n{3,}/g, '\n\n');
    }

    return text.replace(/[ \t]+\n/g, '\n').trim();
}

export function resolveSafeBuyerFirstName(raw?: string | null): string {
    const trimmed = (raw || '').trim();
    if (!trimmed) return 'Cliente';

    // Rimuoviamo Sig., Sig.ra, Signora, Signor, dr., dott., dott.ssa, gentile, ecc.
    const clean = trimmed
        .replace(/^(sig\.|sig\.ra|signora|signor|egregio|egregia|gentile|dott\.|dott\.ssa|dr\.|dr\.ssa)\s+/i, '')
        .trim();

    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Cliente';

    const firstName = parts[0]!;
    // Sanitizzazione del nome: prendiamo solo caratteri alfabetici
    const cleanFirstName = firstName.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’-]/g, '');
    const lower = cleanFirstName.toLowerCase();
    if (!cleanFirstName || lower === 'prova' || lower === 'test' || lower === 'sandbox' || lower === 'dev') {
        return 'Cliente';
    }

    return cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1);
}
