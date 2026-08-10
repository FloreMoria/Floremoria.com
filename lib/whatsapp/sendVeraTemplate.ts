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

function buildTextHeaderComponent(params: string[]): WhatsAppTemplateComponent {
    return {
        type: 'header',
        parameters: params.map((text) => ({
            type: 'text' as const,
            text: sanitizeMetaTemplateParam(text),
        })),
    };
}

function buildImageHeaderComponent(imageUrl: string): WhatsAppTemplateComponent {
    return {
        type: 'header',
        parameters: [{ type: 'image' as const, image: { link: imageUrl } }],
    };
}

/**
 * Invia un template Meta del workflow VERA con validazione param count.
 *
 * Dedup ordine 24h: SOLO template testo (conferme/reminder).
 * Template con header immagine (foto posa) sono esclusi: Admin/Utente devono
 * poter inviare 2+ foto sequenziali senza `duplicate_prevented`.
 */
export async function sendVeraTemplate(
    phone: string,
    templateId: VeraTemplateId,
    bodyParams: string[],
    options?: {
        headerImageUrl?: string;
        headerTextParams?: string[];
        orderId?: string;
        orderNumber?: string | null;
        /** Forza skip dedup (es. reinvio foto esplicito). */
        skipOrderDedup?: boolean;
    }
): Promise<SendVeraTemplateResult> {
    const spec = getVeraTemplate(templateId);

    const isMediaTemplate = Boolean(spec.hasImageHeader || options?.headerImageUrl?.trim());
    const skipDedup = Boolean(options?.skipOrderDedup || isMediaTemplate);

    // Controllo Deduplicazione/Idempotenza basato su orderId nelle ultime 24 ore (solo testo).
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
    } else if (isMediaTemplate && options?.orderId) {
        console.info(
            `[vera-template] Dedup ordine saltato per template media ${templateId} (foto sequenziali consentite).`
        );
    }

    if (bodyParams.length !== spec.bodyParamCount) {
        const msg = `Template ${spec.metaName}: attesi ${spec.bodyParamCount} parametri body, ricevuti ${bodyParams.length}.`;
        console.warn(`[vera-template] ${msg}`);
        return { ok: false, error: msg, errorCode: 132000 };
    }

    const headerTextCount = spec.headerTextParamCount ?? 0;
    const headerTextParams = options?.headerTextParams ?? [];
    if (headerTextParams.length !== headerTextCount) {
        const msg = `Template ${spec.metaName}: attesi ${headerTextCount} parametri header, ricevuti ${headerTextParams.length}.`;
        return { ok: false, error: msg, errorCode: 132000 };
    }

    for (const text of [...headerTextParams, ...bodyParams]) {
        if (!sanitizeMetaTemplateParam(text)) {
            return { ok: false, error: 'Parametro template vuoto.', errorCode: 132000 };
        }
    }

    const components: WhatsAppTemplateComponent[] = [];
    if (spec.hasImageHeader) {
        const rawUrl = options?.headerImageUrl?.trim();
        if (!rawUrl) {
            return { ok: false, error: 'Header immagine mancante per template multimediale.' };
        }
        const { stripUrlQueryAndFragment } = await import('@/lib/whatsapp/metaPublicImageUrl');
        const url = stripUrlQueryAndFragment(rawUrl);
        if (!/^https:\/\//i.test(url)) {
            return { ok: false, error: 'URL immagine header deve essere HTTPS pubblico per Meta.' };
        }
        if (/private\.blob\.vercel-storage\.com/i.test(url)) {
            return {
                ok: false,
                error: 'URL immagine header privato: usare /api/chat/media o Blob pubblico JPEG.',
            };
        }
        console.info(`[vera-template] ${spec.id} header image host: ${url.replace(/^https?:\/\/([^/]+).*/, '$1')}`);
        components.push(buildImageHeaderComponent(url));
    } else if (headerTextCount > 0) {
        components.push(buildTextHeaderComponent(headerTextParams));
    }
    components.push(buildBodyComponent(bodyParams));

    const metaPayloadPreview = {
        type: 'template' as const,
        template: {
            name: spec.metaName,
            language: { code: spec.language },
            components,
        },
        bodyParamCount: bodyParams.length,
        headerTextParamCount: headerTextParams.length,
        mapping: describeTemplateParamMapping(spec),
        paramsPreview: [...headerTextParams, ...bodyParams].map((p) => p.slice(0, 80)),
    };
    console.info(
        `[vera-template] ${spec.id} → Meta payload: ${JSON.stringify(metaPayloadPreview)}`
    );

    return sendWhatsAppTemplateMessage(phone, spec.metaName, spec.language, components, {
        expectedBodyParamCount: spec.bodyParamCount,
        expectedHeaderTextParamCount: headerTextCount > 0 ? headerTextCount : undefined,
    });
}
