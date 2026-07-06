import {
    sendWhatsAppTemplateMessage,
    type WhatsAppTemplateComponent,
} from '@/lib/whatsapp/metaCloudApiClient';
import { getVeraTemplate, type VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';
import { sanitizeMetaTemplateParam } from '@/lib/whatsapp/approvedTemplates';

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
    options?: { headerImageUrl?: string }
): Promise<SendVeraTemplateResult> {
    const spec = getVeraTemplate(templateId);

    if (bodyParams.length !== spec.bodyParamCount) {
        const msg = `Template ${spec.metaName}: attesi ${spec.bodyParamCount} parametri, ricevuti ${bodyParams.length}.`;
        console.warn(`[vera-template] ${msg}`);
        return { ok: false, error: msg, errorCode: 132000 };
    }

    for (let i = 0; i < bodyParams.length; i += 1) {
        if (!sanitizeMetaTemplateParam(bodyParams[i] ?? '')) {
            return { ok: false, error: `Parametro {{${i + 1}}} vuoto.`, errorCode: 132000 };
        }
    }

    const components: WhatsAppTemplateComponent[] = [];
    if (spec.hasImageHeader) {
        const url = options?.headerImageUrl?.trim();
        if (!url) {
            return { ok: false, error: 'Header immagine mancante per template multimediale.' };
        }
        components.push(buildImageHeaderComponent(url));
    }
    components.push(buildBodyComponent(bodyParams));

    return sendWhatsAppTemplateMessage(phone, spec.metaName, spec.language, components, {
        expectedBodyParamCount: spec.bodyParamCount,
    });
}
