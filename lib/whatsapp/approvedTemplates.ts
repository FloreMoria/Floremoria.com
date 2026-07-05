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
    /** Testo fisso approvato su Meta con {{1}} saluto, {{2}} ordine, {{3}} note staff. */
    bodyTemplate: string;
}

export const PROACTIVE_CONVERSATION_TEMPLATE_ID = 'messaggio_personalizzato_fiorista';

/**
 * Body template Meta approvato — il saluto "Gentile [Nome]" va nel parametro {{1}}, non nel testo fisso.
 * {{1}} = es. "Gentile Carlo" | {{2}} = codice ordine | {{3}} = note staff.
 */
export const PROACTIVE_CONVERSATION_BODY_TEMPLATE_CANONICAL =
    "{{1}}, in merito all'ordine identificato come {{2}}.\n\n{{3}}\n\nRestiamo a Sua completa disposizione.\nLo Staff di FloreMoria";

function isUsableProactiveBodyTemplate(value: string): boolean {
    if (!/\{\{1\}\}/.test(value) || !/\{\{2\}\}/.test(value)) return false;
    if (/testo_esatto|approvato_da_meta|placeholder|debug/i.test(value)) return false;
    // Evita doppio "Gentile" se l'env è stato configurato con "Gentile {{1}}"
    if (/gentile\s*\{\{1\}\}/i.test(value)) return false;
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
        metaName: envTemplateName(
            'WHATSAPP_TEMPLATE_PROACTIVE',
            'floremoria_messaggio_personalizzato_fiorista'
        ),
        label: 'Messaggio personalizzato fiorista',
        description: 'Template Meta: {{1}} Gentile+nome, {{2}} codice ordine, {{3}} note staff.',
        language: 'it',
        parameterLabels: ['Saluto (Gentile + nome)', 'Codice ordine', 'Note dello Staff'],
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

/** Meta rifiuta newline/tab nei parametri body (errore #132018). */
export function sanitizeMetaTemplateParam(value: string, maxLen = 900): string {
    return value
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, maxLen);
}

export function buildTemplateBodyParameters(
    params: string[] = []
): Array<{ type: 'text'; text: string }> {
    return params.slice(0, 3).map((value) => ({
        type: 'text' as const,
        text: sanitizeMetaTemplateParam(value?.trim() || '—'),
    }));
}

/** Sostituisce {{1}}, {{2}}, {{3}} nel body template con i valori reali del messaggio. */
export function renderProactiveTemplateBody(
    bodyTemplate: string,
    recipientFirstName: string,
    orderCode: string,
    staffNotes: string
): string {
    const salutation = formatGentileSalutation(recipientFirstName);
    const code = normalizeOrderCode(orderCode);
    const notes = staffNotes.trim();

    return bodyTemplate
        .replace(/\{\{1\}\}/g, salutation || '…')
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
