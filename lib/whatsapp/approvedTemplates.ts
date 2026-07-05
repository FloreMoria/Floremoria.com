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

/** Numero tassativo di variabili body sul template Meta approvato. */
export const PROACTIVE_TEMPLATE_BODY_PARAM_COUNT = 3;

/**
 * Body template Meta approvato.
 * {{1}} = nome di battesimo (es. Carlo) — "Gentile" è nel testo fisso.
 * {{2}} = codice ordine | {{3}} = note staff.
 */
export const PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL =
    "Gentile {{1}}, in merito all'ordine identificato come {{2}}.\n\n{{3}}\n\nRestiamo a Sua completa disposizione.\nLo Staff di FloreMoria";

function isUsableProactiveBodyTemplate(value: string): boolean {
    if (!/\{\{1\}\}/.test(value) || !/\{\{2\}\}/.test(value) || !/\{\{3\}\}/.test(value)) {
        return false;
    }
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
            'Template Meta: Gentile {{1}} nome, {{2}} codice ordine, {{3}} note staff.',
        language: process.env.WHATSAPP_TEMPLATE_PROACTIVE_LANGUAGE?.trim() || 'it',
        parameterLabels: ['Nome destinatario', 'Codice ordine', 'Note dello Staff'],
        bodyTemplate: resolveProactiveBodyTemplate(),
    };
}

export function listApprovedWhatsAppTemplates(): WhatsAppTemplateDefinition[] {
    return [getProactiveWhatsAppTemplate()];
}

export function getApprovedWhatsAppTemplate(templateId?: string): WhatsAppTemplateDefinition | null {
    const template = getProactiveWhatsAppTemplate();
    if (!templateId || templateId === template.id) return template;
    return null;
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
            'Inserisca il codice ordine (variabile {{2}}), es. FF-PN-26-004.'
        );
    }
    if (!staffNotes) {
        throw new ProactiveTemplateValidationError('Compili le note dello staff (variabile {{3}}).');
    }

    return { recipientFirstName, orderCode, staffNotes };
}

/**
 * Costruisce esattamente 3 parametri body per Meta Cloud API.
 * Nessun placeholder "—": valori mancanti → errore di validazione a monte.
 */
export function buildTemplateBodyParameters(
    recipientFirstName: string,
    orderCode: string,
    staffNotes: string
): Array<{ type: 'text'; text: string }> {
    const validated = validateProactiveTemplateBodyValues({
        recipientFirstName,
        orderCode,
        staffNotes,
    });

    const parameters = [
        { type: 'text' as const, text: sanitizeMetaTemplateParam(validated.recipientFirstName) },
        { type: 'text' as const, text: sanitizeMetaTemplateParam(validated.orderCode) },
        { type: 'text' as const, text: sanitizeMetaTemplateParam(validated.staffNotes) },
    ];

    if (parameters.length !== PROACTIVE_TEMPLATE_BODY_PARAM_COUNT) {
        throw new ProactiveTemplateValidationError(
            `Template Meta richiede ${PROACTIVE_TEMPLATE_BODY_PARAM_COUNT} parametri body, ricevuti ${parameters.length}.`
        );
    }

    for (let i = 0; i < parameters.length; i += 1) {
        if (!parameters[i].text) {
            throw new ProactiveTemplateValidationError(`Parametro template {{${i + 1}}} vuoto o non valido.`);
        }
    }

    return parameters;
}

/** Component "body" pronto per sendWhatsAppTemplateMessage. */
export function buildProactiveTemplateBodyComponent(values: ProactiveTemplateBodyValues) {
    return {
        type: 'body' as const,
        parameters: buildTemplateBodyParameters(
            values.recipientFirstName,
            values.orderCode,
            values.staffNotes
        ),
    };
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

/** Ricostruisce il messaggio completo per lo storico chat e anteprima dashboard. */
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
