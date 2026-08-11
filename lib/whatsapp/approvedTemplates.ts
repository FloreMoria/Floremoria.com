import {
    extractFirstName,
    formatGentileSalutation,
    normalizeOrderCode,
} from '@/lib/whatsapp/proactiveTemplateParams';
import {
    listVeraFloristLibraryTemplates,
    listVeraUserLibraryTemplates,
} from '@/lib/whatsapp/templateLibraries';

/** Scenario A: librerie rigidamente separate. */
export type TemplateLibrary = 'FLORIST' | 'UTENTE';

export interface WhatsAppTemplateField {
    /** Chiave stabile usata nel payload dashboard. */
    key: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    /**
     * Scenario A: solo `body` (nessuna interstazione/header Meta).
     * `header` resta nel tipo solo per compatibilità di lettura legacy — non viene inviato.
     */
    location: 'header' | 'body';
    /** Indice 0-based nello slot Meta di quella sezione ({{1}} = 0). */
    index: number;
    /** Suggerimento UI (textarea vs input). */
    multiline?: boolean;
    /** Valore di default opzionale (es. link catalogo). */
    defaultValue?: string;
    /**
     * Se false, campo solo UI (non mappato su {{n}} Meta).
     * Es. codice ordine nel messaggio personalizzato: finisce dentro body {{2}}.
     */
    metaBound?: boolean;
}

export interface WhatsAppTemplateDefinition {
    id: string;
    metaName: string;
    label: string;
    description: string;
    language: string;
    /** Etichette legacy (ordine body) per retrocompat UI. */
    parameterLabels: string[];
    /** Testo fisso approvato su Meta con {{1}}… per anteprima body. */
    bodyTemplate: string;
    /** Scenario A: sempre 0 — nessun header Meta. */
    headerTextParamCount: number;
    bodyParamCount: number;
    /** Libreria Fioristi o Utenti. */
    library: TemplateLibrary;
    fields: WhatsAppTemplateField[];
}

export const PROACTIVE_CONVERSATION_TEMPLATE_ID = 'messaggio_personalizzato_fiorista';

/** Nome registrato su Meta Business Manager. */
export const PROACTIVE_CONVERSATION_META_TEMPLATE_NAME =
    'floremoria_messaggio_personalizzato_fiorista_ft';

/** @deprecated Legacy con HEADER — preferire FT body-only. */
export const PROACTIVE_CONVERSATION_META_TEMPLATE_NAME_LEGACY =
    'floremoria_messaggio_personalizzato_fiorista';

/** Template Meta promemoria ricorrenze GdM (−4 giorni). */
export const ANNIVERSARY_GDM_TEMPLATE_ID = 'promemoria_anniversario_gdm';
export const ANNIVERSARY_GDM_META_TEMPLATE_NAME = 'promemoria_anniversario_gdm';
export const ANNIVERSARY_GDM_BODY_PARAM_COUNT = 3;
/** Meta live: HEADER testo {{1}} defunto ancora richiesto. */
export const ANNIVERSARY_GDM_HEADER_PARAM_COUNT = 1;

/** Numero tassativo di variabili body sul template Meta FT approvato. */
export const PROACTIVE_TEMPLATE_BODY_PARAM_COUNT = 3;

/** Scenario A FT: nessun header. */
export const PROACTIVE_TEMPLATE_HEADER_TEXT_PARAM_COUNT = 0;

/**
 * Body template Meta FT approvato (3 variabili body, nessun header).
 * {{1}} nome | {{2}} codice ordine | {{3}} note staff.
 */
export const PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL =
    "Gentile {{1}},\nin merito all'ordine {{2}}: {{3}}\nGrazie.\nTutto lo Staff di FloreMoria la saluta cordialmente🌹";

function isUsableProactiveBodyTemplate(value: string): boolean {
    if (!/\{\{1\}\}/.test(value) || !/\{\{2\}\}/.test(value) || !/\{\{3\}\}/.test(value)) {
        return false;
    }
    if (/\{\{4\}\}/.test(value)) return false;
    if (/testo_esatto|approvato_da_meta|placeholder|debug/i.test(value)) return false;
    return true;
}

/** Risolve il body template: env solo se valido, altrimenti canonico Meta. */
export function resolveProactiveBodyTemplate(): string {
    const fromEnv = process.env.WHATSAPP_TEMPLATE_PROACTIVE_BODY?.trim();
    if (fromEnv && isUsableProactiveBodyTemplate(fromEnv)) return fromEnv;
    return PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL;
}

function envTemplateName(key: string, fallback: string): string {
    return process.env[key]?.trim() || fallback;
}

export function getProactiveWhatsAppTemplate(): WhatsAppTemplateDefinition {
    return {
        id: PROACTIVE_CONVERSATION_TEMPLATE_ID,
        metaName: envTemplateName('WHATSAPP_TEMPLATE_PROACTIVE', PROACTIVE_CONVERSATION_META_TEMPLATE_NAME),
        label: 'Messaggio personalizzato fiorista (staff)',
        description: 'Meta FT body-only: {{1}} nome, {{2}} codice ordine, {{3}} note staff.',
        language: process.env.WHATSAPP_TEMPLATE_PROACTIVE_LANGUAGE?.trim() || 'it',
        parameterLabels: ['Nome destinatario', 'Codice ordine', 'Note dello Staff'],
        bodyTemplate: resolveProactiveBodyTemplate(),
        headerTextParamCount: 0,
        bodyParamCount: PROACTIVE_TEMPLATE_BODY_PARAM_COUNT,
        library: 'FLORIST',
        fields: [
            {
                key: 'recipientFirstName',
                label: 'Nome destinatario',
                placeholder: 'Es. Carlo',
                required: true,
                location: 'body',
                index: 0,
                metaBound: true,
            },
            {
                key: 'orderCode',
                label: 'Codice ordine',
                placeholder: 'Es. FF-PN-26-004',
                required: true,
                location: 'body',
                index: 1,
                metaBound: true,
            },
            {
                key: 'staffNotes',
                label: 'Note dello Staff',
                placeholder: 'Testo libero del messaggio…',
                required: true,
                location: 'body',
                index: 2,
                multiline: true,
                metaBound: true,
            },
        ],
    };
}

export function getAnniversaryGdmWhatsAppTemplate(): WhatsAppTemplateDefinition {
    return {
        id: ANNIVERSARY_GDM_TEMPLATE_ID,
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_ANNIVERSARY_GDM',
            ANNIVERSARY_GDM_META_TEMPLATE_NAME
        ),
        label: 'Promemoria anniversario GdM',
        description:
            'Meta live: header {{1}} defunto · body {{1}} utente, {{2}} defunto, {{3}} link.',
        language: process.env.WHATSAPP_TEMPLATE_ANNIVERSARY_GDM_LANGUAGE?.trim() || 'it',
        parameterLabels: [
            'Nome defunto (header)',
            'Nome utente',
            'Nome defunto',
            'Link catalogo/GdM',
        ],
        bodyTemplate:
            'Gentile {{1}}, tra pochi giorni ricorre una data cara nel ricordo di {{2}}. ' +
            'Se desidera un pensiero floreale, può consultare le proposte qui: {{3}}',
        headerTextParamCount: ANNIVERSARY_GDM_HEADER_PARAM_COUNT,
        bodyParamCount: ANNIVERSARY_GDM_BODY_PARAM_COUNT,
        library: 'UTENTE',
        fields: [
            {
                key: 'headerDeceasedName',
                label: 'Nome del Defunto (header Meta)',
                placeholder: 'Es. Maria Pullano',
                required: true,
                location: 'header',
                index: 0,
                metaBound: true,
            },
            {
                key: 'userFirstName',
                label: 'Nome dell\'Utente',
                placeholder: 'Es. Valentina',
                required: true,
                location: 'body',
                index: 0,
                metaBound: true,
            },
            {
                key: 'deceasedName',
                label: 'Nome del Defunto',
                placeholder: 'Es. Maria Pullano',
                required: true,
                location: 'body',
                index: 1,
                metaBound: true,
            },
            {
                key: 'catalogUrl',
                label: 'Link catalogo / GdM',
                placeholder: 'https://www.floremoria.com/fiori-sulle-tombe',
                required: true,
                location: 'body',
                index: 2,
                defaultValue: 'https://www.floremoria.com/fiori-sulle-tombe',
                metaBound: true,
            },
        ],
    };
}

export function getCustomerWaitingUpdateWhatsAppTemplate(): WhatsAppTemplateDefinition {
    return {
        id: 'customer_waiting_update',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_CUSTOMER_WAITING_UPDATE',
            'floremoria_aggiornamento_attesa'
        ),
        label: 'Notifica utente (aggiornamento attesa)',
        description: 'Template Meta: {{1}} nome utente, {{2}} defunto.',
        language: 'it',
        parameterLabels: ['Nome utente', 'Nome defunto'],
        bodyTemplate:
            'Gentile {{1}}, desideriamo rassicurarLa sul fatto che stiamo seguendo da vicino la preparazione del Suo omaggio nel ricordo di {{2}}.',
        headerTextParamCount: 0,
        bodyParamCount: 2,
        library: 'UTENTE',
        fields: [
            {
                key: 'buyerFirstName',
                label: 'Nome dell\'Utente',
                placeholder: 'Es. Luciano',
                required: true,
                location: 'body',
                index: 0,
                metaBound: true,
            },
            {
                key: 'deceasedName',
                label: 'Nome del Defunto',
                placeholder: 'Es. Salvatore Tusa',
                required: true,
                location: 'body',
                index: 1,
                metaBound: true,
            },
        ],
    };
}

export function getFloristReminderWhatsAppTemplate(): WhatsAppTemplateDefinition {
    return {
        id: 'florist_reminder',
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_FLORIST_REMINDER',
            'floremoria_sollecito_fiorista'
        ),
        label: 'Sollecito fiorista',
        description: 'Template Meta: {{1}} fiorista, {{2}} codice ordine, {{3}} link mini-app.',
        language: 'it',
        parameterLabels: ['Nome fiorista', 'Codice ordine', 'Link mini-app'],
        bodyTemplate:
            'Gentile {{1}}, in merito all\'ordine {{2}} in consegna… {{3}}',
        headerTextParamCount: 0,
        bodyParamCount: 3,
        library: 'FLORIST',
        fields: [
            {
                key: 'floristFirstName',
                label: 'Nome fiorista',
                placeholder: 'Es. Tindaro',
                required: true,
                location: 'body',
                index: 0,
                metaBound: true,
            },
            {
                key: 'orderCode',
                label: 'Codice ordine',
                placeholder: 'Es. FT-ME-26-002',
                required: true,
                location: 'body',
                index: 1,
                metaBound: true,
            },
            {
                key: 'deliveryUrl',
                label: 'Link mini-app',
                placeholder: 'https://www.floremoria.com/fiorista/consegna/…',
                required: true,
                location: 'body',
                index: 2,
                metaBound: true,
            },
        ],
    };
}

/**
 * Catalogo Scenario A: Libreria Fioristi + Libreria Utenti (o filtro per ruolo).
 */
export function listApprovedWhatsAppTemplates(
    library?: TemplateLibrary
): WhatsAppTemplateDefinition[] {
    const florist = [
        ...listVeraFloristLibraryTemplates().filter((t) => t.id !== 'florist_reminder'),
        getFloristReminderWhatsAppTemplate(),
        getProactiveWhatsAppTemplate(),
    ];
    const users = listVeraUserLibraryTemplates().map((t) => {
        if (t.id === 'customer_waiting_update') return getCustomerWaitingUpdateWhatsAppTemplate();
        if (t.id === 'anniversary_gdm_reminder') {
            return { ...getAnniversaryGdmWhatsAppTemplate(), id: 'anniversary_gdm_reminder' };
        }
        return t;
    });

    if (library === 'FLORIST') return florist;
    if (library === 'UTENTE') return users;
    return [...florist, ...users];
}

export function getApprovedWhatsAppTemplate(templateId?: string): WhatsAppTemplateDefinition | null {
    const templates = listApprovedWhatsAppTemplates();
    if (!templateId) return templates[0] ?? null;
    if (templateId === ANNIVERSARY_GDM_TEMPLATE_ID) {
        return (
            templates.find((t) => t.id === 'anniversary_gdm_reminder') ||
            templates.find((t) => t.id === ANNIVERSARY_GDM_TEMPLATE_ID) ||
            null
        );
    }
    return templates.find((t) => t.id === templateId) ?? null;
}

/** Fold codice ordine nelle note body {{2}} (Scenario A: no header). */
export function composeProactiveStaffNotes(orderCode: string, staffNotes: string): string {
    const code = normalizeOrderCode(orderCode);
    const notes = sanitizeMetaTemplateParam(staffNotes);
    if (code && notes) return sanitizeMetaTemplateParam(`Rif. ordine ${code}. ${notes}`);
    return notes || (code ? sanitizeMetaTemplateParam(`Rif. ordine ${code}.`) : '');
}

/**
 * Costruisce i componenti Meta da valori campo UI.
 * Include header SOLO se il template Meta lo richiede (variabili header).
 */
export function buildOperatorTemplateComponents(
    template: WhatsAppTemplateDefinition,
    fieldValues: Record<string, string>
): Array<{
    type: 'header' | 'body';
    parameters: Array<{ type: 'text'; text: string }>;
}> {
    const headerFields = template.fields
        .filter((f) => f.location === 'header' && f.metaBound !== false)
        .sort((a, b) => a.index - b.index);
    const bodyFields = template.fields
        .filter((f) => f.location === 'body' && f.metaBound !== false)
        .sort((a, b) => a.index - b.index);

    for (const field of template.fields) {
        if (!field.required) continue;
        const value = sanitizeMetaTemplateParam(fieldValues[field.key] ?? '');
        if (!value) {
            throw new ProactiveTemplateValidationError(`Compili il campo "${field.label}".`);
        }
    }

    const mapField = (field: WhatsAppTemplateField) => {
        let raw = fieldValues[field.key] ?? '';
        if (
            field.key === 'recipientFirstName' ||
            field.key === 'userFirstName' ||
            field.key === 'buyerFirstName' ||
            field.key === 'floristFirstName'
        ) {
            raw = extractFirstName(raw) || raw;
        }
        if (field.key === 'orderCode') {
            raw = normalizeOrderCode(raw);
        }
        return {
            type: 'text' as const,
            text: sanitizeMetaTemplateParam(raw) || '-',
        };
    };

    const components: Array<{
        type: 'header' | 'body';
        parameters: Array<{ type: 'text'; text: string }>;
    }> = [];

    if (headerFields.length > 0 || template.headerTextParamCount > 0) {
        components.push({
            type: 'header',
            parameters: headerFields.map(mapField),
        });
    }

    components.push({
        type: 'body',
        parameters: bodyFields.map(mapField),
    });

    const body = components.find((c) => c.type === 'body');
    if (!body || body.parameters.length !== template.bodyParamCount) {
        throw new ProactiveTemplateValidationError(
            `Template richiede ${template.bodyParamCount} parametri body.`
        );
    }

    return components;
}

/** Anteprima testo (header solo se presente sul template Meta). */
export function renderOperatorTemplatePreview(
    template: WhatsAppTemplateDefinition,
    fieldValues: Record<string, string>
): string {
    const header = template.fields
        .filter((f) => f.location === 'header' && f.metaBound !== false)
        .sort((a, b) => a.index - b.index)
        .map((f) => sanitizeMetaTemplateParam(fieldValues[f.key] ?? '') || '…')
        .join(' · ');

    let body = template.bodyTemplate;
    const bodyFields = template.fields
        .filter((f) => f.location === 'body' && f.metaBound !== false)
        .sort((a, b) => a.index - b.index);
    bodyFields.forEach((field, i) => {
        let raw = fieldValues[field.key] ?? '';
        if (
            field.key === 'recipientFirstName' ||
            field.key === 'userFirstName' ||
            field.key === 'buyerFirstName' ||
            field.key === 'floristFirstName'
        ) {
            raw = extractFirstName(raw) || raw;
        }
        body = body.replace(
            new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'),
            sanitizeMetaTemplateParam(raw) || '…'
        );
    });

    return header ? `${header}\n\n${body}` : body;
}

export class ProactiveTemplateValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProactiveTemplateValidationError';
    }
}

/** Meta rifiuta newline/tab nei parametri body (errori #132000 / #132018). */
export function sanitizeMetaTemplateParam(value: string, maxLen = 900): string {
    return value
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, maxLen);
}

export interface ProactiveTemplateBodyValues {
    recipientFirstName: string;
    orderCode: string;
    staffNotes: string;
}

/** Valida i tre campi obbligatori — nessun fallback fittizio verso Meta. */
export function validateProactiveTemplateBodyValues(input: {
    recipientFirstName?: string;
    orderCode?: string;
    staffNotes?: string;
}): ProactiveTemplateBodyValues {
    const recipientFirstName = extractFirstName(input.recipientFirstName ?? '');
    const orderCode = normalizeOrderCode(input.orderCode ?? '');
    const staffNotes = sanitizeMetaTemplateParam(input.staffNotes ?? '');

    if (!recipientFirstName) {
        throw new ProactiveTemplateValidationError(
            'Inserisca il nome del destinatario (variabile {{1}}, es. Carlo).'
        );
    }
    if (!orderCode) {
        throw new ProactiveTemplateValidationError(
            'Inserisca il codice ordine (variabile {{2}}, es. FF-PN-26-004).'
        );
    }
    if (!staffNotes) {
        throw new ProactiveTemplateValidationError('Compili le note dello staff (variabile body {{3}}).');
    }

    return { recipientFirstName, orderCode, staffNotes };
}

/**
 * Costruisce i parametri body (3) per Meta Cloud API FT.
 */
export function buildTemplateBodyParameters(
    recipientFirstName: string,
    orderCode: string,
    staffNotes: string
): Array<{ type: 'text'; text: string }> {
    const firstName = sanitizeMetaTemplateParam(extractFirstName(recipientFirstName)) || '-';
    const code = sanitizeMetaTemplateParam(normalizeOrderCode(orderCode)) || '-';
    const notes = sanitizeMetaTemplateParam(staffNotes) || '-';

    const parameters = [
        { type: 'text' as const, text: firstName },
        { type: 'text' as const, text: code },
        { type: 'text' as const, text: notes },
    ];

    if (parameters.length !== PROACTIVE_TEMPLATE_BODY_PARAM_COUNT) {
        throw new ProactiveTemplateValidationError(
            `Template Meta richiede ${PROACTIVE_TEMPLATE_BODY_PARAM_COUNT} parametri body, ricevuti ${parameters.length}.`
        );
    }

    return parameters;
}

/** Body-only FT ({{1}} nome, {{2}} ordine, {{3}} note). */
export function buildProactiveTemplateComponents(values: ProactiveTemplateBodyValues) {
    const validated = validateProactiveTemplateBodyValues(values);
    return [
        {
            type: 'body' as const,
            parameters: buildTemplateBodyParameters(
                validated.recipientFirstName,
                validated.orderCode,
                validated.staffNotes
            ),
        },
    ];
}

/** @deprecated Usare buildProactiveTemplateComponents */
export function buildProactiveTemplateBodyComponent(values: ProactiveTemplateBodyValues) {
    const components = buildProactiveTemplateComponents(values);
    const body = components.find((c) => c.type === 'body');
    if (!body) throw new ProactiveTemplateValidationError('Component body mancante.');
    return body;
}

/** Sostituisce {{1}}, {{2}}, {{3}} nel body template con i valori reali del messaggio. */
export function renderProactiveTemplateBody(
    bodyTemplate: string,
    recipientFirstName: string,
    orderCode: string,
    staffNotes: string
): string {
    const firstName = extractFirstName(recipientFirstName);
    const code = normalizeOrderCode(orderCode);
    const notes = staffNotes.trim();

    return bodyTemplate
        .replace(/\{\{1\}\}/g, firstName || '…')
        .replace(/\{\{2\}\}/g, code || '…')
        .replace(/\{\{3\}\}/g, notes || '…');
}

/** Anteprima body per dashboard. */
export function renderProactiveTemplateMessage(
    recipientFirstName: string,
    orderCode: string,
    staffNotes: string
): string {
    return renderProactiveTemplateBody(
        PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL,
        recipientFirstName,
        orderCode,
        staffNotes
    );
}

export { extractFirstName, formatGentileSalutation, normalizeOrderCode };
