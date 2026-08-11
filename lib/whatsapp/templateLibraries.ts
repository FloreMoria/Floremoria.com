/**
 * Scenario A — cataloghi template Meta da VERA registry (solo body, no header).
 */

import type {
    TemplateLibrary,
    WhatsAppTemplateDefinition,
    WhatsAppTemplateField,
} from '@/lib/whatsapp/approvedTemplates';
import { VERA_TEMPLATES, type VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';

const SLOT_UI: Record<
    string,
    { label: string; placeholder?: string; multiline?: boolean; defaultValue?: string }
> = {
    floristFirstName: { label: 'Nome fiorista', placeholder: 'Es. Carlo' },
    buyerFirstName: { label: 'Nome utente', placeholder: 'Es. Valentina' },
    userFirstName: { label: "Nome dell'Utente", placeholder: 'Es. Valentina' },
    recipientFirstName: { label: 'Nome destinatario', placeholder: 'Es. Carlo' },
    orderCode: { label: 'Codice ordine', placeholder: 'Es. FT-ME-26-002' },
    floristPrice: { label: 'Compenso fiorista', placeholder: 'Es. Compenso €45' },
    deceasedName: { label: 'Nome del Defunto', placeholder: 'Es. Maria Rossi' },
    rememberedPerson: { label: 'Nome del Defunto', placeholder: 'Es. Maria Rossi' },
    cemeteryLabel: { label: 'Cimitero / luogo', placeholder: 'Es. Cimitero di Padova' },
    cemeteryName: { label: 'Nome cimitero', placeholder: 'Es. Cimitero Monumentale' },
    gravePosition: { label: 'Indicazioni tomba', placeholder: 'Es. Campo A, fila 3' },
    deliveryUrl: {
        label: 'Link mini-app fiorista',
        placeholder: 'https://www.floremoria.com/fiorista/consegna/…',
    },
    magicLink: { label: 'MagicLink foto', placeholder: 'https://www.floremoria.com/f/…' },
    partnerCity: { label: 'Comune / zona', placeholder: 'Es. Padova' },
    staffNotes: {
        label: 'Note dello Staff',
        placeholder: 'Testo libero del messaggio…',
        multiline: true,
    },
    luminoYesNo: { label: 'Lumino (Sì/No)', placeholder: 'Sì' },
    ticketYesNo: { label: 'Bigliettino (Sì/No)', placeholder: 'No' },
    ticketText: { label: 'Testo biglietto', placeholder: 'Nessuno', multiline: true },
    catalogUrl: {
        label: 'Link catalogo / GdM',
        placeholder: 'https://www.floremoria.com/fiori-sulle-tombe',
        defaultValue: 'https://www.floremoria.com/fiori-sulle-tombe',
    },
};

export const FLORIST_LIBRARY_IDS: VeraTemplateId[] = [
    'florist_first_001',
    'florist_first_002',
    'florist_first_003',
    'florist_first_004',
    'florist_repeat',
    'florist_reminder',
    'florist_tomb_not_found',
];

export const USER_LIBRARY_IDS: VeraTemplateId[] = [
    'customer_order_confirm',
    'customer_delivery_photo',
    'customer_waiting_update',
    'customer_cemetery_closed',
    'anniversary_gdm_reminder',
];

const FLORIST_LABELS: Partial<Record<VeraTemplateId, string>> = {
    florist_first_001: 'Nuovo ordine fiorista · parte 1 (nome/codice/compenso)',
    florist_first_002: 'Nuovo ordine fiorista · parte 2 (lumino/biglietto)',
    florist_first_003: 'Nuovo ordine fiorista · parte 3 (defunto/luogo)',
    florist_first_004: 'Nuovo ordine fiorista · parte 4 (link consegna)',
    florist_repeat: 'Nuovo ordine fiorista (11 variabili)',
    florist_reminder: 'Sollecito accettazione / completamento',
    florist_tomb_not_found: 'Tomba non trovata',
};

const USER_LABELS: Partial<Record<VeraTemplateId, string>> = {
    customer_order_confirm: 'Conferma ordine cliente',
    customer_delivery_photo: 'Consegna completata + MagicLink foto',
    customer_waiting_update: 'Aggiornamento attesa consegna',
    customer_cemetery_closed: 'Avviso cimitero chiuso',
    anniversary_gdm_reminder: 'Promemoria anniversario GdM',
};

function fieldsFromBodySlots(slots: readonly string[]): WhatsAppTemplateField[] {
    return slots.map((slot, index) => {
        const ui = SLOT_UI[slot] ?? { label: slot, placeholder: slot };
        return {
            key: slot,
            label: ui.label,
            placeholder: ui.placeholder,
            required: true,
            location: 'body' as const,
            index,
            multiline: ui.multiline,
            defaultValue: ui.defaultValue,
            metaBound: true,
        };
    });
}

export function definitionFromVeraId(
    id: VeraTemplateId,
    library: TemplateLibrary,
    label?: string
): WhatsAppTemplateDefinition {
    const spec = VERA_TEMPLATES[id];
    const resolvedLabel =
        label ||
        (library === 'FLORIST' ? FLORIST_LABELS[id] : USER_LABELS[id]) ||
        id;
    return {
        id,
        metaName: spec.metaName,
        label: resolvedLabel,
        description: spec.description,
        language: spec.language,
        parameterLabels: spec.bodySlots.map(
            (slot, i) => `{{${i + 1}}} ${SLOT_UI[slot]?.label ?? slot}`
        ),
        bodyTemplate: spec.bodyCanonical,
        headerTextParamCount: 0,
        bodyParamCount: spec.bodyParamCount,
        library,
        fields: fieldsFromBodySlots(spec.bodySlots),
    };
}

export function listVeraFloristLibraryTemplates(): WhatsAppTemplateDefinition[] {
    return FLORIST_LIBRARY_IDS.map((id) => definitionFromVeraId(id, 'FLORIST'));
}

export function listVeraUserLibraryTemplates(): WhatsAppTemplateDefinition[] {
    return USER_LIBRARY_IDS.map((id) => definitionFromVeraId(id, 'UTENTE'));
}
