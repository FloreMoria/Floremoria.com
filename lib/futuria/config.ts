/**
 * Configurazione Futuria CRM (API v2 compatibile GoHighLevel).
 * Credenziali sempre da env — mai hardcoded (VITO).
 */

export const FUTURIA_DEFAULT_API_BASE = 'https://services.leadconnectorhq.com';
export const FUTURIA_DEFAULT_API_VERSION = '2021-07-28';

export function getFuturiaApiKey(): string | null {
    return process.env.FUTURIA_API_KEY?.trim() || null;
}

export function getFuturiaLocationId(): string | null {
    return process.env.FUTURIA_LOCATION_ID?.trim() || null;
}

export function getFuturiaApiBase(): string {
    return process.env.FUTURIA_API_BASE_URL?.trim() || FUTURIA_DEFAULT_API_BASE;
}

export function getFuturiaApiVersion(): string {
    return process.env.FUTURIA_API_VERSION?.trim() || FUTURIA_DEFAULT_API_VERSION;
}

export function isFuturiaConfigured(): boolean {
    return Boolean(getFuturiaApiKey() && getFuturiaLocationId());
}

/** Estrae l'indirizzo email da `FLOREM_MAIL_FROM` ("Nome <email@dominio>"). */
export function parseFloremMailFromAddress(fromHeader: string): string {
    const match = fromHeader.match(/<([^>]+)>/);
    return (match?.[1] || fromHeader).trim();
}

export function getSiteBaseUrl(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        'https://www.floremoria.com'
    ).replace(/\/$/, '');
}

/** Numero WhatsApp business FloreMoria su Futuria (default: linea assistenza). */
export function getFuturiaBusinessWhatsAppPhone(): string {
    const raw =
        process.env.FUTURIA_WHATSAPP_FROM?.trim() ||
        process.env.FUTURIA_WHATSAPP_NUMBER?.trim() ||
        '+393204105305';
    return raw.replace(/[^\d+]/g, '').replace(/^39/, '+39').replace(/^(\d)/, '+$1');
}

/** Template Meta approvato per Proof of Delivery (obbligatorio fuori finestra 24h). */
export function getFuturiaWhatsAppProofTemplateId(): string | null {
    return process.env.FUTURIA_WHATSAPP_PROOF_TEMPLATE_ID?.trim() || null;
}

/** Config campi custom Futuria per storico defunti (append-only). */
export interface FuturiaDeceasedFieldConfig {
    /** Elenco testuale cronologico (una riga per defunto). */
    storicoKey: string;
    /** Slot 1 — non sovrascritto se già valorizzato. */
    defuntoKey: string;
    /** Sempre aggiornato con il defunto dell'ordine corrente. */
    defuntoUltimoKey: string;
    maxProgressiveSlots: number;
}

export function getFuturiaDeceasedFieldConfig(): FuturiaDeceasedFieldConfig {
    return {
        storicoKey:
            process.env.FUTURIA_CF_DEFUNTI_STORICO_KEY?.trim() || 'contact.defunti_storico',
        defuntoKey: process.env.FUTURIA_CF_DEFUNTO_KEY?.trim() || 'contact.defunto',
        defuntoUltimoKey:
            process.env.FUTURIA_CF_DEFUNTO_ULTIMO_KEY?.trim() || 'contact.defunto_ultimo',
        maxProgressiveSlots: Math.min(
            20,
            Math.max(2, Number(process.env.FUTURIA_CF_DEFUNTO_MAX_SLOTS || 10) || 10)
        ),
    };
}
