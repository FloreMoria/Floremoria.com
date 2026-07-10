import { META_TEMPLATE_LIMITS } from '@/lib/whatsapp/metaTemplateLimits';

/**
 * Invito a rispondere per aprire la finestra conversazione Meta (24h).
 * Deve restare intero: non va mai troncato.
 */
export const CUSTOMER_CONFIRM_CTA =
    'Risponda OK o scriva qui un messaggio per qualsiasi richiesta 🌹';

/** Slot {{3}} nel template Meta approvato — limite conservativo (Meta tronca prima di 115). */
export const MAX_CUSTOMER_CONFIRM_SLOT3_CHARS = 92;

/**
 * Testo fisso approvato su Meta per floremoria_conferma_ordine_utente.
 * Allinea anteprima dashboard al messaggio reale WhatsApp.
 */
export const CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL = `Gentile {{1}},
La ringraziamo per aver scelto FloreMoria. Le confermiamo che il nostro partner di fiducia di zona ha preso in carico il Suo omaggio nel ricordo di {{2}}. {{3}} Ci stringiamo al Suo pensiero e seguiremo ogni passo con la massima cura.
Restiamo a sua disposizione. FloreMoria Staff 🌹`;

function stripWarmLead(raw: string): string {
    return raw
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^(gentile|egregi[oa]|caro|carissim[oa]|buongiorno|buonasera)\s+[^,.!?]+[,!]?\s*/i, '')
        .replace(/scriva\s+ok.*$/i, '')
        .replace(/rispond(a|ere)\s+ok.*$/i, '')
        .trim();
}

/** Compone {{3}}: frase breve + CTA completa, senza mai tagliare la CTA. */
export function composeCustomerConfirmSlot3(warmLead?: string | null): string {
    const cta = CUSTOMER_CONFIRM_CTA;
    const suffix = `. ${cta}`;
    const max = MAX_CUSTOMER_CONFIRM_SLOT3_CHARS;
    const maxLeadLen = Math.max(12, max - suffix.length);

    let lead =
        stripWarmLead(warmLead || '') ||
        'Ci invieremo la foto della posa appena completata';

    if (lead.length > maxLeadLen) {
        let cut = lead.slice(0, maxLeadLen);
        const lastSpace = cut.lastIndexOf(' ');
        if (lastSpace > Math.floor(maxLeadLen * 0.45)) cut = cut.slice(0, lastSpace);
        cut = cut.replace(/[,;:\s]+$/, '');
        if (!/[.!?…]$/.test(cut)) cut += '.';
        lead = cut;
    } else if (!/[.!?…]$/.test(lead)) {
        lead += '.';
    }

    const composed = `${lead}${suffix}`;
    if (composed.length <= max) return composed;

    // Ultima difesa: solo CTA (meglio invito completo che frase tronca).
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
