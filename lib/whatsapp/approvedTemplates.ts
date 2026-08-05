import {
    extractFirstName,
    formatGentileSalutation,
    normalizeOrderCode,
} from '@/lib/whatsapp/proactiveTemplateParams';

export interface WhatsAppTemplateDefinition {
    id: string;
    metaName: string;
    label: string;
    description: string;
    language: string;
    parameterLabels: string[];
    /** Testo fisso approvato su Meta con {{1}} nome, {{2}} ordine, {{3}} note staff. */
    bodyTemplate: string;
}

export const PROACTIVE_CONVERSATION_TEMPLATE_ID = 'messaggio_personalizzato_fiorista';

/** Nome registrato su Meta Business Manager. */
export const PROACTIVE_CONVERSATION_META_TEMPLATE_NAME = 'floremoria_messaggio_personalizzato_fiorista';

/** Template Meta promemoria ricorrenze GdM (−4 giorni). */
export const ANNIVERSARY_GDM_TEMPLATE_ID = 'promemoria_anniversario_gdm';
export const ANNIVERSARY_GDM_META_TEMPLATE_NAME = 'promemoria_anniversario_gdm';
export const ANNIVERSARY_GDM_BODY_PARAM_COUNT = 3;

/** Numero tassativo di variabili body sul template Meta approvato. */
export const PROACTIVE_TEMPLATE_BODY_PARAM_COUNT = 2;

/** Header testo (es. codice ordine) — variabile {{1}} nell'header Meta. */
export const PROACTIVE_TEMPLATE_HEADER_TEXT_PARAM_COUNT = 1;

/**
 * Body template Meta approvato (2 variabili body).
 * Header Meta (separato): {{1}} = codice ordine.
 * Body {{1}} = nome di battesimo | Body {{2}} = note staff.
 */
export const PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL =
    "Gentile {{1}}, in merito al Suo ordine.\n\n{{2}}\n\nRestiamo a Sua completa disposizione.\nLo Staff di FloreMoria";

function isUsableProactiveBodyTemplate(value: string): boolean {
    if (!/\{\{1\}\}/.test(value) || !/\{\{2\}\}/.test(value)) {
        return false;
    }
    if (/\{\{3\}\}/.test(value)) return false;
    if (/testo_esatto|approvato_da_meta|placeholder|debug/i.test(value)) return false;
    // {{1}} deve essere il solo nome: il testo fisso include già "Gentile"
    if (/^\s*\{\{1\}\}/.test(value)) return false;
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
        label: 'Messaggio personalizzato fiorista',
        description:
            'Template Meta: header ordine, body {{1}} nome, {{2}} note staff.',
        language: process.env.WHATSAPP_TEMPLATE_PROACTIVE_LANGUAGE?.trim() || 'it',
        parameterLabels: ['Codice ordine (header)', 'Nome destinatario', 'Note dello Staff'],
        bodyTemplate: resolveProactiveBodyTemplate(),
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
            'Template Meta: {{1}} nome utente, {{2}} defunto, {{3}} link catalogo/GdM.',
        language: process.env.WHATSAPP_TEMPLATE_ANNIVERSARY_GDM_LANGUAGE?.trim() || 'it',
        parameterLabels: ['Nome utente', 'Nome e cognome defunto', 'Link catalogo/GdM'],
        bodyTemplate:
            'Gentile {{1}}, tra pochi giorni ricorre una data cara nel ricordo di {{2}}. ' +
            'Se desidera un pensiero floreale, può consultare le proposte qui: {{3}}',
    };
}

export function listApprovedWhatsAppTemplates(): WhatsAppTemplateDefinition[] {
    return [getProactiveWhatsAppTemplate(), getAnniversaryGdmWhatsAppTemplate()];
}

export function getApprovedWhatsAppTemplate(templateId?: string): WhatsAppTemplateDefinition | null {
    const templates = listApprovedWhatsAppTemplates();
    if (!templateId) return templates[0] ?? null;
    return templates.find((t) => t.id === templateId) ?? null;
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
            'Inserisca il codice ordine (variabile header {{1}}), es. FF-PN-26-004.'
        );
    }
    if (!staffNotes) {
        throw new ProactiveTemplateValidationError('Compili le note dello staff (variabile body {{2}}).');
    }

    return { recipientFirstName, orderCode, staffNotes };
}

/**
 * Costruisce i parametri body (2) per Meta Cloud API.
 */
export function buildTemplateBodyParameters(
    recipientFirstName: string,
    staffNotes: string
): Array<{ type: 'text'; text: string }> {
    const firstName = sanitizeMetaTemplateParam(extractFirstName(recipientFirstName));
    const notes = sanitizeMetaTemplateParam(staffNotes);

    if (!firstName) {
        throw new ProactiveTemplateValidationError(
            'Inserisca il nome del destinatario (variabile body {{1}}, es. Carlo).'
        );
    }
    if (!notes) {
        throw new ProactiveTemplateValidationError('Compili le note dello staff (variabile body {{2}}).');
    }

    const parameters = [
        { type: 'text' as const, text: firstName },
        { type: 'text' as const, text: notes },
    ];

    if (parameters.length !== PROACTIVE_TEMPLATE_BODY_PARAM_COUNT) {
        throw new ProactiveTemplateValidationError(
            `Template Meta richiede ${PROACTIVE_TEMPLATE_BODY_PARAM_COUNT} parametri body, ricevuti ${parameters.length}.`
        );
    }

    return parameters;
}

/** Header + body pronti per sendWhatsAppTemplateMessage. */
export function buildProactiveTemplateComponents(values: ProactiveTemplateBodyValues) {
    const validated = validateProactiveTemplateBodyValues(values);
    return [
        {
            type: 'header' as const,
            parameters: [
                {
                    type: 'text' as const,
                    text: sanitizeMetaTemplateParam(validated.orderCode),
                },
            ],
        },
        {
            type: 'body' as const,
            parameters: buildTemplateBodyParameters(
                validated.recipientFirstName,
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
        .replace(/\{\{2\}\}/g, notes || '…');
}

/** Anteprima completa header + body per dashboard. */
export function renderProactiveTemplateMessage(
    recipientFirstName: string,
    orderCode: string,
    staffNotes: string
): string {
    const code = normalizeOrderCode(orderCode);
    const body = renderProactiveTemplateBody(
        PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL,
        recipientFirstName,
        orderCode,
        staffNotes
    );
    return code ? `Ordine ${code}\n\n${body}` : body;
}

export { extractFirstName, formatGentileSalutation, normalizeOrderCode };
