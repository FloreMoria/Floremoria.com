import {
    sendWhatsAppTemplateMessage,
    type WhatsAppTemplateComponent,
} from '@/lib/whatsapp/metaCloudApiClient';
import { getVeraTemplate, type VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';
import { sanitizeMetaTemplateParam } from '@/lib/whatsapp/approvedTemplates';
import { describeTemplateParamMapping } from '@/lib/whatsapp/veraTemplateParams';

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
 */
export async function sendVeraTemplate(
    phone: string,
    templateId: VeraTemplateId,
    bodyParams: string[],
    options?: { headerImageUrl?: string; headerTextParams?: string[] }
): Promise<SendVeraTemplateResult> {
    const spec = getVeraTemplate(templateId);

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
        const url = options?.headerImageUrl?.trim();
        if (!url) {
            return { ok: false, error: 'Header immagine mancante per template multimediale.' };
        }
        if (!/^https:\/\//i.test(url)) {
            return { ok: false, error: 'URL immagine header deve essere HTTPS pubblico per Meta.' };
        }
        console.info(`[vera-template] ${spec.id} header image host: ${url.replace(/^https?:\/\/([^/]+).*/, '$1')}`);
        components.push(buildImageHeaderComponent(url));
    } else if (headerTextCount > 0) {
        components.push(buildTextHeaderComponent(headerTextParams));
    }
    components.push(buildBodyComponent(bodyParams));

    console.info(
        `[vera-template] ${spec.id} → Meta "${spec.metaName}" | ${describeTemplateParamMapping(spec)} | params=${JSON.stringify([...headerTextParams, ...bodyParams].map((p) => p.slice(0, 60)))}`
    );

    return sendWhatsAppTemplateMessage(phone, spec.metaName, spec.language, components, {
        expectedBodyParamCount: spec.bodyParamCount,
        expectedHeaderTextParamCount: headerTextCount > 0 ? headerTextCount : undefined,
    });
}
