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
    | 'florist_bonifico_ricevuta'
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
        // Meta live Scenario A: body-only FT ({{1}} nome, {{2}} ordine, {{3}} note).
        // Evita #132000 sul vecchio template con HEADER {{1}}.
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_PROACTIVE',
            'floremoria_messaggio_personalizzato_fiorista_ft'
        ),
        language: process.env.WHATSAPP_TEMPLATE_PROACTIVE_LANGUAGE?.trim() || 'it',
        bodyParamCount: 3,
        bodySlots: ['floristFirstName', 'orderCode', 'staffNotes'],
        library: 'FLORIST',
        bodyCanonical:
            "Gentile {{1}}, in merito all'ordine {{2}}: {{3}}\nGrazie.\nTutto lo Staff di FloreMoria la saluta cordialmente🌹",
        description: 'Body-only FT: {{1}} nome, {{2}} codice ordine, {{3}} note staff',
    },
    florist_first_001: {
        id: 'florist_first_001',
        // Meta live (ago 2026): floremoria_nuovo_ordine_fiorista_ft_1 (non fioristi_ft_001).
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_FLORIST_FIRST_001',
            'floremoria_nuovo_ordine_fiorista_ft_1'
        ),
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['floristFirstName', 'orderCode', 'floristPrice'],
        library: 'FLORIST',
        bodyCanonical: 'Gentile {{1}} … ordine {{2}} … importo {{3}}',
        description: '{{1}} nome, {{2}} codice ordine, {{3}} importo (es. 20€)',
    },
    florist_first_002: {
        id: 'florist_first_002',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_FLORIST_FIRST_002',
            'floremoria_nuovo_ordine_fiorista_ft_2'
        ),
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['luminoYesNo', 'ticketYesNo', 'ticketText'],
        library: 'FLORIST',
        bodyCanonical: 'Lumino [{{1}}] · Bigliettino [{{2}}] · Testo [{{3}}]',
        description: '{{1}} lumino Sì/No, {{2}} bigliettino Sì/No, {{3}} testo biglietto',
    },
    florist_first_003: {
        id: 'florist_first_003',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_FLORIST_FIRST_003',
            'floremoria_nuovo_ordine_fiorista_ft_3'
        ),
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['deceasedName', 'cemeteryLabel', 'gravePosition'],
        library: 'FLORIST',
        bodyCanonical: 'Tomba di {{1}} · cimitero di {{2}} · indicazioni {{3}}',
        description: '{{1}} defunto, {{2}} città/cimitero, {{3}} indicazioni tomba',
    },
    florist_first_004: {
        id: 'florist_first_004',
        // Meta live: plurale "fioristi" + suffisso 004 (diverso da ft_1/2/3).
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_FLORIST_FIRST_004',
            'floremoria_nuovo_ordine_fioristi_ft_004'
        ),
        language: 'it',
        bodyParamCount: 1,
        bodySlots: ['deliveryUrl'],
        library: 'FLORIST',
        bodyCanonical: '{{1}}',
        description: '{{1}} link mini-app fiorista',
    },
    florist_repeat: {
        id: 'florist_repeat',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_FLORIST_REPEAT',
            'floremoria_nuovo_ordine_fiorista'
        ),
        language: 'it',
        bodyParamCount: 11,
        // Meta live (ago 2026): 11 variabili body, header statico (non inviare header).
        bodySlots: [
            'floristFirstName', // {{1}}
            'orderCode', // {{2}}
            'deceasedName', // {{3}}
            'deliveryDeadline', // {{4}}
            'deliveryCity', // {{5}}
            'deliveryPlace', // {{6}}
            'productLabel', // {{7}}
            'accessories', // {{8}}
            'ticketText', // {{9}}
            'floristPrice', // {{10}}
            'deliveryUrl', // {{11}}
        ],
        library: 'FLORIST',
        bodyCanonical:
            "Ciao {{1}}! 🌸\n" +
            "Abbiamo un nuovo ordine per te con il codice: {{2}}\n" +
            "🕊️ In memoria di: {{3}}\n" +
            "📅 CONSEGNA : {{4}}\n" +
            "📍 Luogo: {{5}}, {{6}}\n" +
            "💐 Prodotto: {{7}}\n" +
            "➕ Optional / Accessori: {{8}}\n" +
            "📝 Testo: {{9}}\n" +
            "💶 Compenso per il servizio: {{10}}\n\n" +
            // Spazio dopo ":" obbligatorio: WhatsApp linkifica l'URL e genera l'anteprima.
            "🔗 Per favore, completa l'ordine con la mini-app: {{11}}\n\n" +
            "Mi confermi?\n" +
            "Grazie mille per il tuo supporto!\n" +
            "Vera | Staff FloreMoria 🌹",
        description:
            '{{1}} nome fiorista, {{2}} codice ordine, {{3}} defunto, {{4}} scadenza, {{5}} comune, {{6}} luogo, {{7}} prodotto, {{8}} accessori, {{9}} testo biglietto, {{10}} compenso, {{11}} link mini-app',
    },
    customer_order_confirm: {
        id: 'customer_order_confirm',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_CUSTOMER_ORDER_CONFIRM',
            'floremoria_conferma_ordine_utente'
        ),
        language: 'it',
        // Meta live: 3 variabili body. {{3}} messaggio staff/Vera (spazio se assente).
        bodyParamCount: 3,
        bodySlots: ['buyerFirstName', 'deceasedName', 'staffMessage'],
        library: 'UTENTE',
        bodyCanonical: CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL,
        description:
            '{{1}} nome acquirente, {{2}} defunto, {{3}} messaggio/domanda personalizzata (opzionale → spazio)',
    },
    /**
     * Template Meta `floremoria_consegna_foto_utente` — notifica post-posa PRIMARIA.
     * Header {{1}} comune/città · body 4 variabili (nome, comune, defunto, MagicLink GdM).
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
        headerTextParamCount: 1,
        headerSlots: ['partnerCity'],
        library: 'UTENTE',
        bodyCanonical:
            'Gentile {{1}},\n' +
            'con immensa gioia Le confermiamo che abbiamo consegnato i Suoi fiori a {{2}} nel ricordo di {{3}}.\n' +
            'Le alleghiamo il MagicLink per rivedere tutte le foto nel Suo Giardino della Memoria: {{4}}\n\n' +
            'Vuole ricevere qui la foto della posa?\n' +
            'Tutto lo Staff di FloreMoria resta a Sua completa disposizione.🌹',
        description:
            'Header {{1}} comune · body {{1}} nome cliente, {{2}} comune, {{3}} defunto, {{4}} URL Giardino della Memoria',
    },
    /**
     * @deprecated Preferire customer_delivery_photo (floremoria_consegna_foto_utente).
     * Stesso Meta name e stesso mapping variabili del template ufficiale.
     */
    ordine_completato: {
        id: 'ordine_completato',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_ORDINE_COMPLETATO',
            'floremoria_consegna_foto_utente'
        ),
        language: process.env.WHATSAPP_TEMPLATE_ORDINE_COMPLETATO_LANGUAGE?.trim() || 'it',
        bodyParamCount: 4,
        bodySlots: ['buyerFirstName', 'partnerCity', 'deceasedName', 'magicLink'],
        library: 'UTENTE',
        bodyCanonical:
            'Gentile {{1}},\n' +
            'con immensa gioia Le confermiamo che abbiamo consegnato i Suoi fiori a {{2}} nel ricordo di {{3}}.\n' +
            'Le alleghiamo il MagicLink per rivedere tutte le foto nel Suo Giardino della Memoria: {{4}}\n\n' +
            'Vuole ricevere qui la foto della posa?\n' +
            'Tutto lo Staff di FloreMoria resta a Sua completa disposizione.🌹',
        description: 'Legacy alias — stesso Meta name e copy di floremoria_consegna_foto_utente',
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
        // Meta live: {{1}} nome, {{2}} codice, {{3}} MagicLink mini-app (non defunto).
        bodySlots: ['floristFirstName', 'orderCode', 'deliveryUrl'],
        library: 'FLORIST',
        bodyCanonical:
            'Gentile {{1}}, in merito all\'ordine {{2}} … mini-app {{3}}.',
        description: '{{1}} nome fiorista, {{2}} codice ordine, {{3}} link mini-app',
    },
    florist_tomb_not_found: {
        id: 'florist_tomb_not_found',
        metaName: 'floremoria_tomba_non_trovata_fiorista',
        language: 'it',
        bodyParamCount: 2,
        // Meta live: {{1}} nome fiorista, {{2}} codice ordine.
        bodySlots: ['floristFirstName', 'orderCode'],
        library: 'FLORIST',
        bodyCanonical: 'Gentile {{1}} … ordine {{2}} …',
        description: '{{1}} nome fiorista, {{2}} codice ordine',
    },
    /**
     * Template Meta `floremoria_bonifico_ricevuta` — conferma bonifico al fiorista (invio manuale staff).
     * {{1}} nome · {{2}} importo · {{3}} codice ordine · {{4}} note opzionali (spazio se vuote).
     */
    florist_bonifico_ricevuta: {
        id: 'florist_bonifico_ricevuta',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_FLORIST_BONIFICO_RICEVUTA',
            'floremoria_bonifico_ricevuta'
        ),
        language: 'it',
        bodyParamCount: 4,
        bodySlots: ['floristFirstName', 'floristPrice', 'orderCode', 'optionalStaffNotes'],
        library: 'FLORIST',
        bodyCanonical:
            'Ciao {{1}},\n' +
            "abbiamo effettuato il bonifico di {{2}} per l'ordine {{3}}, puoi verificare sul tuo home-banking.\n" +
            'Preferisci la ricevuta qui in chat?\n' +
            '{{4}}\n' +
            'Attendiamo fattura come sempre e ti ringraziamo del supporto.\n' +
            'Buon lavoro da tutto lo Staff di FloreMoria🌹',
        description:
            '{{1}} nome fiorista, {{2}} importo/compenso, {{3}} codice ordine, {{4}} note staff (opz. → spazio)',
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
        headerTextParamCount: 1,
        headerSlots: ['rememberedPerson'],
        bodyCanonical:
            'Gentile {{1}}, tra pochi giorni ricorre una data cara nel ricordo di {{2}}. ' +
            'Se desidera un pensiero floreale, può consultare le proposte qui: {{3}}',
        description: 'Header {{1}} defunto · body {{1}} utente, {{2}} defunto, {{3}} link catalogo/GdM',
    },
};

export function getVeraTemplate(id: VeraTemplateId): VeraTemplateSpec {
    return VERA_TEMPLATES[id];
}

export const GOOGLE_REVIEW_URL =
    'https://g.page/r/CYtHIOAB65TOEB0/review';
