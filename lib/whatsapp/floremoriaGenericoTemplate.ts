/**
 * Template Meta ufficiale `floremoria_generico` — aggiornamenti operativi VERA / staff.
 * Body: Gentile {{1}}, volevamo informarla {{2}}. … FloreMoria Staff 🌹
 */

import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sanitizeMetaTemplateParam } from '@/lib/whatsapp/sanitizeMetaParam';
import type { TemplateLibrary, WhatsAppTemplateDefinition } from '@/lib/whatsapp/approvedTemplates';

export const FLOREMORIA_GENERICO_TEMPLATE_ID = 'floremoria_generico';
export const FLOREMORIA_GENERICO_META_NAME = 'floremoria_generico';
export const FLOREMORIA_GENERICO_LANGUAGE = 'it';

export const FLOREMORIA_GENERICO_BODY_CANONICAL =
    'Gentile {{1}}, volevamo informarla {{2}}.\n\nRimaniamo a sua disposizione.\nFloreMoria Staff 🌹';

const GREETING_PREFIX_RE =
    /^(?:gentile|ciao|buongiorno|buonasera|salve|caro|cara)\s+[^,.\n]{1,40}[,.\s!-]*/i;
const CLOSING_SUFFIX_RE =
    /(?:\n|\s)*(?:rimaniamo\s+a\s+(?:sua\s+)?disposizione|restiamo\s+a\s+(?:sua\s+)?disposizione|a\s+presto|cordiali\s+saluti|buon\s+lavoro|tutto\s+lo\s+staff\s+di\s+floremoria|floremoria\s+staff|vera\s*\|\s*staff\s+floremoria)[\s\S]*$/i;
const SIGNATURE_LINE_RE = /^[\s—–-]*vera\s*\|\s*staff\s+floremoria[\s🌹]*$/gim;

/**
 * Pulisce il testo per {{2}}: niente saluto iniziale né chiusura (già nel template Meta).
 */
export function prepareGenericoUpdateBody(raw: string): string {
    let text = String(raw || '').trim();
    if (!text) return '';

    text = text.replace(SIGNATURE_LINE_RE, '').trim();
    text = text.replace(GREETING_PREFIX_RE, '').trim();
    text = text.replace(CLOSING_SUFFIX_RE, '').trim();
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return sanitizeMetaTemplateParam(text, 900) || sanitizeMetaTemplateParam(raw, 900) || '-';
}

export function resolveGenericoRecipientName(raw?: string | null): string {
    const first = extractFirstName(String(raw || '').trim());
    return sanitizeMetaTemplateParam(first, 60) || 'Cliente';
}

export function buildFloremoriaGenericoBodyParams(
    recipientName: string,
    updateMessage: string
): [string, string] {
    return [resolveGenericoRecipientName(recipientName), prepareGenericoUpdateBody(updateMessage)];
}

export function buildFloremoriaGenericoComponents(
    recipientName: string,
    updateMessage: string
): Array<{
    type: 'body';
    parameters: Array<{ type: 'text'; text: string }>;
}> {
    const [nameParam, updateParam] = buildFloremoriaGenericoBodyParams(recipientName, updateMessage);
    return [
        {
            type: 'body',
            parameters: [
                { type: 'text', text: nameParam },
                { type: 'text', text: updateParam },
            ],
        },
    ];
}

export function renderFloremoriaGenericoPreview(recipientName: string, updateMessage: string): string {
    const [nameParam, updateParam] = buildFloremoriaGenericoBodyParams(recipientName, updateMessage);
    return FLOREMORIA_GENERICO_BODY_CANONICAL.replace(/\{\{1\}\}/g, nameParam).replace(
        /\{\{2\}\}/g,
        updateParam
    );
}

export function getFloremoriaGenericoWhatsAppTemplate(
    library: TemplateLibrary = 'UTENTE'
): WhatsAppTemplateDefinition {
    return {
        id: FLOREMORIA_GENERICO_TEMPLATE_ID,
        metaName: FLOREMORIA_GENERICO_META_NAME,
        label: 'Aggiornamento generico (floremoria_generico)',
        description:
            'Meta {{1}} nome destinatario · {{2}} testo libero aggiornamento (senza saluto/chiusura ridondanti).',
        language: FLOREMORIA_GENERICO_LANGUAGE,
        parameterLabels: ['Nome destinatario', 'Testo aggiornamento'],
        bodyTemplate: FLOREMORIA_GENERICO_BODY_CANONICAL,
        headerTextParamCount: 0,
        bodyParamCount: 2,
        library,
        fields: [
            {
                key: 'recipientFirstName',
                label: 'Nome destinatario',
                placeholder: 'Es. Luciano (default: Cliente)',
                required: false,
                location: 'body',
                index: 0,
                metaBound: true,
            },
            {
                key: 'updateMessage',
                label: 'Testo aggiornamento (variabile {{2}})',
                placeholder:
                    'Es. la consegna dell\'ordine FT-UD-26-004 è confermata per domani mattina entro le 10:00.',
                required: true,
                location: 'body',
                index: 1,
                multiline: true,
                metaBound: true,
            },
        ],
    };
}
