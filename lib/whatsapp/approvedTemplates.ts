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
 * Testo body template Meta (allineare a WHATSAPP_TEMPLATE_PROACTIVE_BODY su Vercel).
 * {{1}} = saluto con nome (es. "Gentile Carlo") — passato come parametro dinamico.
 * {{2}} = codice ordine.
 * {{3}} = note staff.
 */
export const PROACTIVE_CONVERSATION_BODY_TEMPLATE =
    process.env.WHATSAPP_TEMPLATE_PROACTIVE_BODY?.trim() ||
    '{{1}}, Le scriviamo da FloreMoria in merito all\'ordine {{2}}.\n\n{{3}}\n\nRestiamo a Sua completa disposizione.\nLo Staff di FloreMoria';

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
        description: 'Template Meta: {{1}} Gentile + nome, {{2}} codice ordine, {{3}} note staff.',
        language: 'it',
        parameterLabels: ['Saluto (Gentile + nome)', 'Codice ordine', 'Note dello Staff'],
        bodyTemplate: PROACTIVE_CONVERSATION_BODY_TEMPLATE,
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

export function buildTemplateBodyParameters(
    params: string[] = []
): Array<{ type: 'text'; text: string }> {
    return params.slice(0, 3).map((value) => ({
        type: 'text' as const,
        text: value?.trim() || '—',
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
        getProactiveWhatsAppTemplate().bodyTemplate,
        recipientFirstName,
        orderCode,
        staffNotes
    );
}

export { extractFirstName, formatGentileSalutation, normalizeOrderCode };
