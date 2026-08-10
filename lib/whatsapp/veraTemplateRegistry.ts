/**
 * Registry template Meta approvati per il workflow nativo VERA.
 * bodySlots definisce l'ordine tassativo dei parametri inviati a Meta.
 */

import { CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL } from '@/lib/vera/customerOrderConfirmCopy';

export type VeraTemplateId =
    | 'proactive_staff'
    | 'florist_first_001'
    | 'florist_first_002'
    | 'florist_first_003'
    | 'florist_first_004'
    | 'florist_repeat'
    | 'customer_order_confirm'
    | 'ordine_completato'
    | 'customer_delivery_photo'
    | 'customer_waiting_update'
    | 'florist_reminder'
    | 'florist_tomb_not_found'
    | 'customer_cemetery_closed'
    | 'anniversary_gdm_reminder';

export interface VeraTemplateSpec {
    id: VeraTemplateId;
    metaName: string;
    language: string;
    bodyParamCount: number;
    /** Nomi slot body in ordine Meta {{1}}, {{2}}, … */
    bodySlots: readonly string[];
    /** Scenario A: libreria Fioristi o Utenti. */
    library: 'FLORIST' | 'UTENTE';
    /** @deprecated Scenario A — header rimossi; ignorato in invio. */
    headerTextParamCount?: number;
    /** @deprecated Scenario A — header rimossi. */
    headerSlots?: readonly string[];
    /** @deprecated Scenario A — nessun header immagine in payload. */
    hasImageHeader?: boolean;
    /** Testo body approvato su Meta (riferimento operativo). */
    bodyCanonical: string;
    description: string;
}

function envTemplateName(key: string, fallback: string): string {
    return process.env[key]?.trim() || fallback;
}

export const VERA_TEMPLATES: Record<VeraTemplateId, VeraTemplateSpec> = {
    proactive_staff: {
        id: 'proactive_staff',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_PROACTIVE',
            'floremoria_messaggio_personalizzato_fiorista'
        ),
        language: process.env.WHATSAPP_TEMPLATE_PROACTIVE_LANGUAGE?.trim() || 'it',
        bodyParamCount: 2,
        bodySlots: ['floristFirstName', 'staffNotes'],
        library: 'FLORIST',
        bodyCanonical:
            'Gentile {{1}}, in merito al Suo ordine.\n\n{{2}}\n\nRestiamo a Sua completa disposizione.\nLo Staff di FloreMoria',
        description: 'Body-only: {{1}} nome fiorista, {{2}} note staff (con rif. ordine)',
    },
    florist_first_001: {
        id: 'florist_first_001',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_001',
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['floristFirstName', 'orderCode', 'floristPrice'],
        library: 'FLORIST',
        bodyCanonical: '{{1}} | ordine {{2}} | compenso {{3}}',
        description: '{{1}} nome, {{2}} codice ordine, {{3}} prezzo listino fiorista',
    },
    florist_first_002: {
        id: 'florist_first_002',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_002',
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['luminoYesNo', 'ticketYesNo', 'ticketText'],
        library: 'FLORIST',
        bodyCanonical: 'Lumino {{1}} | Bigliettino {{2}} | Testo {{3}}',
        description: '{{1}} lumino Sì/No, {{2}} bigliettino Sì/No, {{3}} testo biglietto',
    },
    florist_first_003: {
        id: 'florist_first_003',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_003',
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['deceasedName', 'cemeteryLabel', 'gravePosition'],
        library: 'FLORIST',
        bodyCanonical: '{{1}} | {{2}} | {{3}}',
        description: '{{1}} defunto, {{2}} cimitero/città, {{3}} indicazioni tomba',
    },
    florist_first_004: {
        id: 'florist_first_004',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_004',
        language: 'it',
        bodyParamCount: 1,
        bodySlots: ['deliveryUrl'],
        library: 'FLORIST',
        bodyCanonical: '{{1}}',
        description: '{{1}} link mini-app fiorista',
    },
    florist_repeat: {
        id: 'florist_repeat',
        metaName: 'floremoria_nuovo_ordine_fiorista',
        language: 'it',
        bodyParamCount: 6,
        bodySlots: [
            'floristFirstName',
            'deceasedName',
            'cemeteryLabel',
            'deliveryUrl',
            'orderCode',
            'floristPrice',
        ],
        library: 'FLORIST',
        bodyCanonical: '{{1}} | {{2}} | {{3}} | {{4}} | {{5}} | {{6}}',
        description: '{{1}} nome, {{2}} defunto, {{3}} cimitero, {{4}} link, {{5}} codice, {{6}} prezzo',
    },
    customer_order_confirm: {
        id: 'customer_order_confirm',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_CUSTOMER_ORDER_CONFIRM',
            'floremoria_conferma_ordine_utente'
        ),
        language: 'it',
        // Meta live (ago 2026): template a 2 variabili. Warm/CTA vanno in free-text post-template.
        bodyParamCount: 2,
        bodySlots: ['buyerFirstName', 'deceasedName'],
        library: 'UTENTE',
        bodyCanonical: CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL,
        description: '{{1}} nome acquirente, {{2}} defunto (warm thought in messaggio libero successivo)',
    },
    /**
     * Template Meta `floremoria_consegna_foto_utente` — notifica post-posa PRIMARIA.
     * 4 variabili body, nessun header (Scenario A).
     */
    customer_delivery_photo: {
        id: 'customer_delivery_photo',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_CUSTOMER_DELIVERY_PHOTO',
            'floremoria_consegna_foto_utente'
        ),
        language: 'it',
        bodyParamCount: 4,
        bodySlots: ['buyerFirstName', 'partnerCity', 'deceasedName', 'magicLink'],
        library: 'UTENTE',
        bodyCanonical:
            'Gentile {{1}}, con immensa gioia Le confermiamo che abbiamo consegnato i Suoi fiori a {{2}} nel ricordo di {{3}}. ' +
            'Può vedere tutte le foto qui: {{4}}\n\n' +
            'Vuole ricevere qui la foto della posa? Risponda Sì oppure No.',
        description:
            '{{1}} nome utente, {{2}} comune/cimitero, {{3}} defunto, {{4}} MagicLink — body-only',
    },
    /**
     * @deprecated Preferire customer_delivery_photo (floremoria_consegna_foto_utente).
     * Mantenuto per env legacy WHATSAPP_TEMPLATE_ORDINE_COMPLETATO.
     */
    ordine_completato: {
        id: 'ordine_completato',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_ORDINE_COMPLETATO',
            'floremoria_consegna_foto_utente'
        ),
        language: process.env.WHATSAPP_TEMPLATE_ORDINE_COMPLETATO_LANGUAGE?.trim() || 'it',
        bodyParamCount: 4,
        bodySlots: ['buyerFirstName', 'deceasedName', 'partnerCity', 'magicLink'],
        library: 'UTENTE',
        bodyCanonical:
            'Gentile {{1}}, abbiamo completato la consegna dei Suoi fiori nel ricordo di {{2}} a {{3}}. ' +
            'Può vedere tutte le foto al link: {{4}}',
        description: 'Legacy alias — stesso Meta name di floremoria_consegna_foto_utente se non override',
    },
    customer_waiting_update: {
        id: 'customer_waiting_update',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_CUSTOMER_WAITING_UPDATE',
            'floremoria_aggiornamento_attesa'
        ),
        language: 'it',
        bodyParamCount: 2,
        bodySlots: ['buyerFirstName', 'deceasedName'],
        library: 'UTENTE',
        // Timing generico (ALMA/SOFIA): mai “poche ore” / “prossime ore” — crea attesa troppo precisa.
        bodyCanonical:
            'Gentile {{1}},\ndesideriamo rassicurarLa sul fatto che stiamo seguendo da vicino la preparazione del Suo omaggio nel ricordo di {{2}}. Le confermeremo la posa non appena sarà completata.\nRestiamo a Sua completa disposizione per qualsiasi necessità.\nA presto dallo Staff di FloreMoria🌹',
        description: '{{1}} nome di battesimo, {{2}} nome defunto — NON usare testi liberi nel campo nome',
    },
    florist_reminder: {
        id: 'florist_reminder',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_FLORIST_REMINDER',
            'floremoria_sollecito_fiorista'
        ),
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['floristFirstName', 'orderCode', 'deceasedName'],
        library: 'FLORIST',
        bodyCanonical:
            'Gentile {{1}}, Le ricordiamo di completare l\'ordine {{2}} per il ricordo di {{3}}.',
        description: '{{1}} nome fiorista, {{2}} codice ordine, {{3}} defunto',
    },
    florist_tomb_not_found: {
        id: 'florist_tomb_not_found',
        metaName: 'floremoria_tomba_non_trovata_fiorista',
        language: 'it',
        bodyParamCount: 2,
        bodySlots: ['orderCode', 'deceasedName'],
        library: 'FLORIST',
        bodyCanonical: 'Ordine {{1}} | defunto {{2}}',
        description: '{{1}} codice ordine, {{2}} defunto',
    },
    customer_cemetery_closed: {
        id: 'customer_cemetery_closed',
        metaName: 'floremoria_avviso_cimitero_chiuso',
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['buyerFirstName', 'deceasedName', 'cemeteryName'],
        library: 'UTENTE',
        bodyCanonical: 'Gentile {{1}} | {{2}} | cimitero {{3}}',
        description: '{{1}} nome, {{2}} defunto, {{3}} cimitero',
    },
    anniversary_gdm_reminder: {
        id: 'anniversary_gdm_reminder',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_ANNIVERSARY_GDM',
            'promemoria_anniversario_gdm'
        ),
        language: process.env.WHATSAPP_TEMPLATE_ANNIVERSARY_GDM_LANGUAGE?.trim() || 'it',
        bodyParamCount: 3,
        bodySlots: ['userFirstName', 'rememberedPerson', 'catalogUrl'],
        library: 'UTENTE',
        bodyCanonical:
            'Gentile {{1}}, tra pochi giorni ricorre una data cara nel ricordo di {{2}}. ' +
            'Se desidera un pensiero floreale, può consultare le proposte qui: {{3}}',
        description: 'Body-only: {{1}} utente, {{2}} defunto, {{3}} link catalogo/GdM',
    },
};

export function getVeraTemplate(id: VeraTemplateId): VeraTemplateSpec {
    return VERA_TEMPLATES[id];
}

export const GOOGLE_REVIEW_URL =
    'https://g.page/r/CYtHIOAB65TOEB0/review';
