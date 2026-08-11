/**
 * Invia un template Meta del workflow VERA con validazione param count.
 * Scenario A: solo componenti body — nessun header testo/immagine verso Meta.
 */

import {
    sendWhatsAppTemplateMessage,
    type WhatsAppTemplateComponent,
} from '@/lib/whatsapp/metaCloudApiClient';
import { getVeraTemplate, type VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';
import { sanitizeMetaTemplateParam } from '@/lib/whatsapp/approvedTemplates';
import { describeTemplateParamMapping } from '@/lib/whatsapp/veraTemplateParams';
import { wasOrderTemplateSentRecent } from '@/lib/vera/orderWorkflow/orderOutboundDedup';

export interface SendVeraTemplateResult {
    ok: boolean;
    messageId?: string;
    error?: string;
    errorCode?: number;
}

function buildBodyComponent(params: string[]): WhatsAppTemplateComponent {
    return {
        type: 'body',
        parameters: params.map((text) => ({
            type: 'text' as const,
            text: sanitizeMetaTemplateParam(text),
        })),
    };
}

/**
 * Invia un template Meta del workflow VERA con validazione param count.
 *
 * Dedup ordine 24h: SOLO template testo (conferme/reminder).
 * Scenario A: payload esclusivamente `type: template` + components body.
 */
export async function sendVeraTemplate(
    phone: string,
    templateId: VeraTemplateId,
    bodyParams: string[],
    options?: {
        /** @deprecated Scenario A — ignorato (no header immagine). */
        headerImageUrl?: string;
        /** @deprecated Scenario A — ignorato (no header testo). */
        headerTextParams?: string[];
        orderId?: string;
        orderNumber?: string | null;
        /** Forza skip dedup (es. reinvio foto esplicito). */
        skipOrderDedup?: boolean;
    }
): Promise<SendVeraTemplateResult> {
    const spec = getVeraTemplate(templateId);

    if (options?.headerImageUrl?.trim() || (options?.headerTextParams?.length ?? 0) > 0) {
        console.warn(
            `[vera-template] ${spec.id}: header ignorato (Scenario A body-only). ` +
                `headerImage=${Boolean(options?.headerImageUrl)} headerTextParams=${options?.headerTextParams?.length ?? 0}`
        );
    }

    const skipDedup = Boolean(options?.skipOrderDedup);

    if (options?.orderId && !skipDedup) {
        try {
            const alreadySent = await wasOrderTemplateSentRecent(
                options.orderId,
                templateId,
                24,
                options.orderNumber
            );
            if (alreadySent) {
                const msg = `Invio bloccato per prevenzione duplicati: template ${templateId} già inviato per l'ordine ${options.orderId} nelle ultime 24 ore.`;
                console.warn(`[vera-template] ${msg}`);
                return { ok: false, error: `duplicate_prevented: ${msg}`, errorCode: 409 };
            }
        } catch (err) {
            console.error('[vera-template] Errore durante il controllo deduplicazione:', err);
        }
    }

    if (bodyParams.length !== spec.bodyParamCount) {
        const msg = `Template ${spec.metaName}: attesi ${spec.bodyParamCount} parametri body, ricevuti ${bodyParams.length}.`;
        console.warn(`[vera-template] ${msg}`);
        return { ok: false, error: msg, errorCode: 132000 };
    }

    for (const text of bodyParams) {
        if (!sanitizeMetaTemplateParam(text)) {
            console.warn(
                `[vera-template] ${spec.id}: parametro vuoto coercizzato a "-" (prevenzione Meta #132000)`
            );
        }
    }

    const safeParams = bodyParams.map((text) => sanitizeMetaTemplateParam(text) || '-');
    if (safeParams.length !== spec.bodyParamCount) {
        const msg = `Template ${spec.metaName}: attesi ${spec.bodyParamCount} parametri body, ricevuti ${safeParams.length}.`;
        console.warn(`[vera-template] ${msg}`);
        return { ok: false, error: msg, errorCode: 132000 };
    }

    const components: WhatsAppTemplateComponent[] = [buildBodyComponent(safeParams)];

    const metaPayloadPreview = {
        type: 'template' as const,
        template: {
            name: spec.metaName,
            language: { code: spec.language },
            components,
        },
        bodyParamCount: safeParams.length,
        mapping: describeTemplateParamMapping(spec),
        paramsPreview: safeParams.map((p) => p.slice(0, 80)),
    };
    console.info(`[vera-template] ${spec.id} → Meta payload: ${JSON.stringify(metaPayloadPreview)}`);

    return sendWhatsAppTemplateMessage(phone, spec.metaName, spec.language, components, {
        expectedBodyParamCount: spec.bodyParamCount,
        expectedHeaderTextParamCount: 0,
    });
}
