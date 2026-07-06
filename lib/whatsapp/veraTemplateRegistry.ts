/**
 * Registry template Meta approvati per il workflow nativo VERA.
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
    /** Header immagine (template multimediale post-consegna) */
    hasImageHeader?: boolean;
    description: string;
}

export const VERA_TEMPLATES: Record<VeraTemplateId, VeraTemplateSpec> = {
    proactive_staff: {
        id: 'proactive_staff',
        metaName: 'floremoria_messaggio_personalizzato_fiorista',
        language: 'it',
        bodyParamCount: 3,
        description: 'Messaggio staff personalizzato al fiorista',
    },
    florist_first_001: {
        id: 'florist_first_001',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_001',
        language: 'it',
        bodyParamCount: 3,
        description: '{{1}} nome, {{2}} codice ordine, {{3}} prezzo listino fiorista',
    },
    florist_first_002: {
        id: 'florist_first_002',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_002',
        language: 'it',
        bodyParamCount: 3,
        description: '{{1}} lumino Sì/No, {{2}} bigliettino Sì/No, {{3}} testo biglietto',
    },
    florist_first_003: {
        id: 'florist_first_003',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_003',
        language: 'it',
        bodyParamCount: 3,
        description: '{{1}} defunto, {{2}} cimitero/città, {{3}} indicazioni tomba',
    },
    florist_first_004: {
        id: 'florist_first_004',
        metaName: 'floremoria_nuovo_ordine_fioristi_ft_004',
        language: 'it',
        bodyParamCount: 1,
        description: '{{1}} link mini-app fiorista',
    },
    florist_repeat: {
        id: 'florist_repeat',
        metaName: 'floremoria_nuovo_ordine_fiorista',
        language: 'it',
        bodyParamCount: 6,
        description: '{{1}} nome, {{2}} defunto, {{3}} cimitero, {{4}} link, {{5}} codice, {{6}} prezzo',
    },
    customer_order_confirm: {
        id: 'customer_order_confirm',
        metaName: 'floremoria_conferma_ordine_utente',
        language: 'it',
        bodyParamCount: 3,
        description: '{{1}} nome, {{2}} defunto, {{3}} pensiero caloroso Gemini',
    },
    customer_delivery_photo: {
        id: 'customer_delivery_photo',
        metaName: 'floremoria_consegna_foto_utente',
        language: 'it',
        bodyParamCount: 2,
        hasImageHeader: true,
        description: 'Header immagine + {{1}} nome, {{2}} defunto',
    },
    customer_waiting_update: {
        id: 'customer_waiting_update',
        metaName: 'floremoria_aggiornamento_attesa',
        language: 'it',
        bodyParamCount: 2,
        description: '{{1}} nome, {{2}} defunto',
    },
    florist_reminder: {
        id: 'florist_reminder',
        metaName: 'floremoria_sollecito_fiorista',
        language: 'it',
        bodyParamCount: 3,
        description: '{{1}} nome fiorista, {{2}} codice ordine, {{3}} defunto',
    },
    florist_tomb_not_found: {
        id: 'florist_tomb_not_found',
        metaName: 'floremoria_tomba_non_trovata_fiorista',
        language: 'it',
        bodyParamCount: 2,
        description: '{{1}} codice ordine, {{2}} defunto',
    },
    customer_cemetery_closed: {
        id: 'customer_cemetery_closed',
        metaName: 'floremoria_avviso_cimitero_chiuso',
        language: 'it',
        bodyParamCount: 3,
        description: '{{1}} nome, {{2}} defunto, {{3}} cimitero',
    },
};

export function getVeraTemplate(id: VeraTemplateId): VeraTemplateSpec {
    return VERA_TEMPLATES[id];
}

export const GOOGLE_REVIEW_URL =
    'https://g.page/r/CYtHIOAB65TOEB0/review';
