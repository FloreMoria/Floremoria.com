/**
 * Registry template Meta approvati per il workflow nativo VERA.
 * bodySlots definisce l'ordine tassativo dei parametri inviati a Meta.
 */

export type VeraTemplateId =
    | 'proactive_staff'
    | 'florist_first_001'
    | 'florist_first_002'
    | 'florist_first_003'
    | 'florist_first_004'
    | 'florist_repeat'
    | 'customer_order_confirm'
    | 'customer_delivery_photo'
    | 'customer_waiting_update'
    | 'florist_reminder'
    | 'florist_tomb_not_found'
    | 'customer_cemetery_closed';

export interface VeraTemplateSpec {
    id: VeraTemplateId;
    metaName: string;
    language: string;
    bodyParamCount: number;
    /** Nomi slot body in ordine Meta {{1}}, {{2}}, … */
    bodySlots: readonly string[];
    /** Header testo (es. codice ordine nel template proattivo). */
    headerTextParamCount?: number;
    headerSlots?: readonly string[];
    /** Header immagine (template multimediale post-consegna) */
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
        headerTextParamCount: 1,
        headerSlots: ['orderCode'],
        bodyCanonical:
            'Gentile {{1}}, in merito al Suo ordine.\n\n{{2}}\n\nRestiamo a Sua completa disposizione.\nLo Staff di FloreMoria',
        description: 'Header ordine + body nome fiorista e note staff',
    },
    florist_first_001: {
        id: 'florist_first_001',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_001',
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['floristFirstName', 'orderCode', 'floristPrice'],
        bodyCanonical: '{{1}} | ordine {{2}} | compenso {{3}}',
        description: '{{1}} nome, {{2}} codice ordine, {{3}} prezzo listino fiorista',
    },
    florist_first_002: {
        id: 'florist_first_002',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_002',
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['luminoYesNo', 'ticketYesNo', 'ticketText'],
        bodyCanonical: 'Lumino {{1}} | Bigliettino {{2}} | Testo {{3}}',
        description: '{{1}} lumino Sì/No, {{2}} bigliettino Sì/No, {{3}} testo biglietto',
    },
    florist_first_003: {
        id: 'florist_first_003',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_003',
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['deceasedName', 'cemeteryLabel', 'gravePosition'],
        bodyCanonical: '{{1}} | {{2}} | {{3}}',
        description: '{{1}} defunto, {{2}} cimitero/città, {{3}} indicazioni tomba',
    },
    florist_first_004: {
        id: 'florist_first_004',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_004',
        language: 'it',
        bodyParamCount: 1,
        bodySlots: ['deliveryUrl'],
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
        bodyParamCount: 3,
        bodySlots: ['buyerFirstName', 'deceasedName', 'warmThought'],
        bodyCanonical:
            'Gentile {{1}}, la ringraziamo per averci affidato il ricordo di {{2}}. {{3}}',
        description: '{{1}} nome, {{2}} defunto, {{3}} pensiero caloroso Gemini',
    },
    customer_delivery_photo: {
        id: 'customer_delivery_photo',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_CUSTOMER_DELIVERY_PHOTO',
            'floremoria_consegna_foto_utente'
        ),
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['buyerFirstName', 'partnerCity', 'deceasedName'],
        hasImageHeader: true,
        bodyCanonical:
            'Buongiorno Sig. {{1}}, il nostro partner di {{2}} ha consegnato i fiori nel ricordo di {{3}}. Le alleghiamo la testimonianza fotografica della consegna.',
        description: 'Header immagine + {{1}} nome, {{2}} città partner, {{3}} defunto',
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
        bodyCanonical:
            'Gentile {{1}}, La informiamo che stiamo monitorando con attenzione la consegna dei fiori nel ricordo di {{2}}. La terremo aggiornata non appena possibile.',
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
        bodyCanonical: 'Ordine {{1}} | defunto {{2}}',
        description: '{{1}} codice ordine, {{2}} defunto',
    },
    customer_cemetery_closed: {
        id: 'customer_cemetery_closed',
        metaName: 'floremoria_avviso_cimitero_chiuso',
        language: 'it',
        bodyParamCount: 3,
        bodySlots: ['buyerFirstName', 'deceasedName', 'cemeteryName'],
        bodyCanonical: 'Gentile {{1}} | {{2}} | cimitero {{3}}',
        description: '{{1}} nome, {{2}} defunto, {{3}} cimitero',
    },
};

export function getVeraTemplate(id: VeraTemplateId): VeraTemplateSpec {
    return VERA_TEMPLATES[id];
}

export const GOOGLE_REVIEW_URL =
    'https://g.page/r/CYtHIOAB65TOEB0/review';
