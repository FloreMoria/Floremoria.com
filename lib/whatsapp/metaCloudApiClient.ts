/**
 * Meta WhatsApp Cloud API — client HTTP nativo FloreMoria.
 *
 * Env richieste:
 *   WHATSAPP_CLOUD_API_KEY      — token permanente Graph API
 *   WHATSAPP_PHONE_NUMBER_ID    — ID numero business WhatsApp
 *   WHATSAPP_APP_SECRET         — firma webhook X-Hub-Signature-256 (consigliato)
 *   WHATSAPP_WEBHOOK_SECRET     — verify_token handshake GET Meta
 *
 * Principio Set-and-Forget: le funzioni non rilanciano eccezioni verso il chiamante.
 */

import { normalizeWamid } from '@/lib/whatsapp/normalizeWamid';

const META_GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v21.0';

export interface WhatsAppSendResult {
    ok: boolean;
    messageId?: string;
    error?: string;
    errorCode?: number;
    errorSubcode?: number;
}

export interface WhatsAppTemplateComponent {
    type: 'body' | 'header' | 'button';
    sub_type?: 'quick_reply' | 'url';
    index?: string;
    parameters?: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: { link: string } }
    >;
}

export interface WhatsAppTemplateSendOptions {
    /** Se impostato, valida il conteggio parametri body prima dell'invio. */
    expectedBodyParamCount?: number;
    /**
     * Header testo con variabili Meta.
     * Se 0 / undefined e `allowImageHeader` non è true → nessun blocco `header` nel payload
     * (header statici Meta non richiedono components; header spurii causano #132000).
     */
    expectedHeaderTextParamCount?: number;
    /** Consente un header immagine anche senza parametri testo. */
    allowImageHeader?: boolean;
}

export interface WhatsAppConnectionState {
    ok: boolean;
    state?: 'open' | 'not_configured' | 'error';
    provider?: 'meta_cloud';
    displayPhoneNumber?: string;
    error?: string;
    missingEnv?: string[];
}

export interface MetaCloudCredentials {
    apiKey: string;
    phoneNumberId: string;
}

/** Prefissi internazionali comuni (clienti diaspora .eu) senza + in input. */
const INTL_COUNTRY_PREFIXES =
    '33|49|44|41|34|31|32|43|48|30|36|40|351|352|353|358|386|420|421|45|46|47|39';

/** Mobile italiano senza prefisso internazionale: 10 cifre che iniziano con 3 (es. 3204910428). */
function isItalianMobileWithoutCountryCode(digits: string): boolean {
    return /^3\d{9}$/.test(digits);
}

/**
 * Normalizza un numero grezzo in E.164 (con prefisso +).
 * Default Italia (+39) solo se il numero non sembra già internazionale.
 *
 * Nota bug: un mobile italiano privo di prefisso (es. "3204910428" o addirittura
 * "+3204910428") veniva dirottato su un paese estero perché "32"/"31"/"30"… sono
 * prefissi internazionali validi. Il mobile italiano (10 cifre che iniziano con 3)
 * va quindi forzato a +39 PRIMA del matching dei prefissi esteri, così le due varianti
 * dello stesso numero collassano su un'unica sessione (+393204910428).
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let p = raw.replace(/^whatsapp:/, '').replace(/[^\d+]/g, '').trim();
    if (!p) return null;
    if (p.startsWith('00')) p = `+${p.slice(2)}`;

    if (p.startsWith('+')) {
        // Già in forma internazionale, ma potrebbe essere un mobile IT a cui manca il 39.
        const digits = p.slice(1);
        if (isItalianMobileWithoutCountryCode(digits)) p = `+39${digits}`;
    } else if (p.startsWith('39') && p.length >= 11) {
        p = `+${p}`;
    } else if (isItalianMobileWithoutCountryCode(p)) {
        p = `+39${p}`;
    } else if (new RegExp(`^(${INTL_COUNTRY_PREFIXES})\\d{6,12}$`).test(p)) {
        p = `+${p}`;
    } else {
        p = `+39${p}`;
    }

    if (!/^\+\d{8,15}$/.test(p)) return null;
    return p;
}

/** Formato destinatario Meta Graph API: cifre internazionali senza + (es. 393204105305). */
export function toMetaRecipientPhone(phone: string): string | null {
    const e164 = normalizePhoneE164(phone);
    if (!e164) return null;
    return e164.replace(/^\+/, '');
}

/** Tronca in sicurezza su codepoint Unicode senza spezzare emoji / coppie surrogate. */
export function safeTruncateUtf8(str: string, maxLen: number): string {
    if (!str) return '';
    const chars = Array.from(str);
    if (chars.length <= maxLen) return str;
    return chars.slice(0, maxLen).join('');
}

export function resolveMetaCloudCredentials(): MetaCloudCredentials {
    const apiKey =
        process.env.WHATSAPP_CLOUD_API_KEY?.trim() ||
        process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
        '';
    return {
        apiKey,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '',
    };
}

export function isMetaCloudConfigured(): boolean {
    const { apiKey, phoneNumberId } = resolveMetaCloudCredentials();
    return Boolean(apiKey && phoneNumberId);
}

/** Diagnostica env Meta (solo nomi variabili, senza segreti). */
export function getWhatsAppEnvDiagnostics(): {
    configured: boolean;
    missing: string[];
} {
    const missing: string[] = [];
    const hasToken =
        Boolean(process.env.WHATSAPP_CLOUD_API_KEY?.trim()) ||
        Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim());
    if (!hasToken) missing.push('WHATSAPP_CLOUD_API_KEY');
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!process.env.WHATSAPP_WEBHOOK_SECRET?.trim()) missing.push('WHATSAPP_WEBHOOK_SECRET');
    if (!process.env.WHATSAPP_APP_SECRET?.trim()) missing.push('WHATSAPP_APP_SECRET');
    return { configured: missing.length === 0, missing };
}

function graphApiUrl(path: string): string {
    return `https://graph.facebook.com/${META_GRAPH_API_VERSION}${path}`;
}

function parseMetaGraphError(body: string): {
    message: string;
    code?: number;
    subcode?: number;
    errorData?: unknown;
    raw?: unknown;
} {
    try {
        const data = JSON.parse(body) as {
            error?: {
                message?: string;
                code?: number;
                error_subcode?: number;
                error_data?: unknown;
                error_user_title?: string;
                error_user_msg?: string;
                fbtrace_id?: string;
                type?: string;
            };
        };
        const err = data.error;
        return {
            message: err?.message || body.slice(0, 200),
            code: err?.code,
            subcode: err?.error_subcode,
            errorData: err?.error_data,
            raw: data,
        };
    } catch {
        return { message: body.slice(0, 200), raw: body };
    }
}

/** Log strutturato del payload template (name / language / components.parameters). */
function logTemplatePayloadExact(payload: Record<string, unknown>): void {
    const template = (payload.template ?? {}) as {
        name?: string;
        language?: { code?: string };
        components?: unknown[];
    };
    console.log('[meta-cloud-api] ===== PAYLOAD EXACT → Meta /messages =====');
    console.log(
        JSON.stringify(
            {
                to: payload.to,
                type: payload.type,
                template: {
                    name: template.name,
                    language: { code: template.language?.code },
                    components: template.components ?? [],
                },
            },
            null,
            2
        )
    );
    console.log('[meta-cloud-api] ===== END PAYLOAD =====');
}

async function postWhatsAppMessage(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
    // Kill-switch emergenza: nessun messaggio Meta (né automatico né operator).
    if (process.env.WHATSAPP_OUTBOUND_DISABLED === '1') {
        console.warn('[meta-cloud-api] WHATSAPP_OUTBOUND_DISABLED=1: invio bloccato.');
        return { ok: false, error: 'outbound_disabled' };
    }

    const config = resolveMetaCloudCredentials();
    if (!config.apiKey || !config.phoneNumberId) {
        console.warn('[meta-cloud-api] WHATSAPP_CLOUD_API_KEY o WHATSAPP_PHONE_NUMBER_ID assenti: invio saltato.');
        return { ok: false, error: 'not_configured' };
    }

    const url = graphApiUrl(`/${config.phoneNumberId}/messages`);
    const payloadType = String(payload.type ?? 'unknown');

    // Debug mirato #132000: JSON esatto subito prima del fetch (senza token).
    if (payloadType === 'template') {
        logTemplatePayloadExact(payload);
    } else {
        console.log(
            `[meta-cloud-api] POST ${url} type=${payloadType} payload=`,
            JSON.stringify(payload)
        );
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const parsed = parseMetaGraphError(body);
            console.error('[meta-cloud-api] ===== META ERROR RESPONSE (full) =====');
            console.error(
                JSON.stringify(
                    {
                        httpStatus: res.status,
                        url,
                        error: {
                            message: parsed.message,
                            code: parsed.code,
                            error_subcode: parsed.subcode,
                            error_data: parsed.errorData,
                        },
                        raw: parsed.raw ?? body,
                        outboundPayloadType: payloadType,
                        outboundTemplateName:
                            payloadType === 'template'
                                ? (payload.template as { name?: string } | undefined)?.name
                                : undefined,
                    },
                    null,
                    2
                )
            );
            console.error('[meta-cloud-api] ===== END META ERROR =====');
            return {
                ok: false,
                error: parsed.message,
                errorCode: parsed.code,
                errorSubcode: parsed.subcode,
            };
        }

        const data = (await res.json()) as { messages?: Array<{ id?: string }> };
        // Normalizza subito: stesso wamid. canonico usato in DB e nei callback statuses.
        const messageId = normalizeWamid(data?.messages?.[0]?.id) || data?.messages?.[0]?.id;
        const recipient = String(payload.to ?? '');
        console.info(`[meta-cloud-api] Messaggio inviato a +${recipient} (id: ${messageId ?? 'N/A'})`);
        return { ok: true, messageId };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[meta-cloud-api] ===== META FETCH EXCEPTION =====');
        console.error(
            JSON.stringify(
                {
                    message: msg,
                    stack: e instanceof Error ? e.stack : undefined,
                    outboundPayload: payload,
                },
                null,
                2
            )
        );
        console.error('[meta-cloud-api] ===== END META EXCEPTION =====');
        return { ok: false, error: msg };
    }
}

/**
 * Invia un messaggio di testo via Meta WhatsApp Cloud API.
 */
export async function sendWhatsAppTextMessage(
    phone: string,
    text: string
): Promise<WhatsAppSendResult> {
    const recipient = toMetaRecipientPhone(phone);
    if (!recipient) {
        console.warn(`[meta-cloud-api] Numero non valido: "${phone}"`);
        return { ok: false, error: 'invalid_phone: Numero di telefono non valido o privo di prefisso internazionale.' };
    }

    const safeBody = safeTruncateUtf8(text, 4000);

    return postWhatsAppMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { preview_url: true, body: safeBody },
    });
}

/**
 * Invia un'immagine via Meta WhatsApp Cloud API (link HTTPS pubblico raggiungibile da Meta).
 */
export async function sendWhatsAppImageMessage(
    phone: string,
    imageUrl: string,
    caption?: string
): Promise<WhatsAppSendResult> {
    const recipient = toMetaRecipientPhone(phone);
    if (!recipient) {
        console.warn(`[meta-cloud-api] Numero non valido: "${phone}"`);
        return { ok: false, error: 'invalid_phone' };
    }

    // Meta: HTTPS pubblico, senza query string (rompe mediaUrl su alcuni client).
    const { stripUrlQueryAndFragment } = await import('@/lib/whatsapp/metaPublicImageUrl');
    const cleanLink = stripUrlQueryAndFragment(imageUrl);
    if (!/^https:\/\//i.test(cleanLink)) {
        console.warn(`[meta-cloud-api] URL immagine non HTTPS pubblico: ${imageUrl.slice(0, 80)}`);
        return { ok: false, error: 'image_url_not_https_public' };
    }
    if (/private\.blob\.vercel-storage\.com/i.test(cleanLink)) {
        console.warn('[meta-cloud-api] URL Blob privato non inviabile a Meta — usare staging /api/chat/media');
        return { ok: false, error: 'image_url_private_blob' };
    }

    const image: Record<string, unknown> = { link: cleanLink };
    if (caption?.trim()) {
        image.caption = caption.trim().slice(0, 1024);
    }

    console.info('[meta-cloud-api] Invio immagine', {
        to: recipient,
        host: cleanLink.replace(/^https?:\/\/([^/]+).*/, '$1'),
        pathTail: cleanLink.slice(-48),
    });

    return postWhatsAppMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'image',
        image,
    });
}

function validateTemplateComponents(
    components: WhatsAppTemplateComponent[],
    options?: WhatsAppTemplateSendOptions
): string | null {
    if (options?.expectedHeaderTextParamCount !== undefined) {
        const header = components.find((c) => c.type === 'header');
        const headerTextCount =
            header?.parameters?.filter((p) => p.type === 'text').length ?? 0;
        if (headerTextCount !== options.expectedHeaderTextParamCount) {
            return `Template Meta: attesi ${options.expectedHeaderTextParamCount} parametri header testo, ricevuti ${headerTextCount}.`;
        }
        for (const param of header?.parameters ?? []) {
            if (param.type === 'text' && !param.text?.trim()) {
                return 'Parametro header testo vuoto.';
            }
        }
    }

    const body = components.find((c) => c.type === 'body');
    if (!body?.parameters?.length) {
        return 'Component body mancante: il template richiede parametri.';
    }
    if (
        options?.expectedBodyParamCount !== undefined &&
        body.parameters.length !== options.expectedBodyParamCount
    ) {
        return `Template Meta: attesi ${options.expectedBodyParamCount} parametri body, ricevuti ${body.parameters.length}.`;
    }
    for (let i = 0; i < body.parameters.length; i += 1) {
        const param = body.parameters[i];
        if (param?.type === 'text') {
            if (!param.text?.trim()) {
                return `Parametro template {{${i + 1}}} vuoto.`;
            }
        } else if (param?.type === 'image') {
            if (!param.image?.link?.trim()) {
                return 'Parametro header immagine mancante.';
            }
        }
    }
    return null;
}

/**
 * Invia un template WhatsApp approvato da Meta (obbligatorio fuori finestra 24h).
 */
export async function sendWhatsAppTemplateMessage(
    phone: string,
    templateName: string,
    languageCode: string,
    components: WhatsAppTemplateComponent[] = [],
    options?: WhatsAppTemplateSendOptions
): Promise<WhatsAppSendResult> {
    const recipient = toMetaRecipientPhone(phone);
    if (!recipient) {
        console.warn(`[meta-cloud-api] Numero non valido: "${phone}"`);
        return { ok: false, error: 'invalid_phone' };
    }

    const expectedHeaderText = options?.expectedHeaderTextParamCount ?? 0;
    const allowImageHeader = Boolean(options?.allowImageHeader);
    const headerAllowed = expectedHeaderText > 0 || allowImageHeader;

    // Controllo rigido: se il template Meta NON ha header variabile/media,
    // rimuovi QUALSIASI blocco { type: "header" } (anche con parameters).
    const cleaned: WhatsAppTemplateComponent[] = [];
    let removedHeaders = 0;
    for (const c of components) {
        if (c.type === 'header') {
            if (!headerAllowed) {
                removedHeaders += 1;
                continue;
            }
            // Header consentito ma vuoto → scarta (Meta non vuole header statici nel payload).
            if (!c.parameters || c.parameters.length === 0) {
                removedHeaders += 1;
                continue;
            }
        }
        cleaned.push(c);
    }
    if (removedHeaders > 0) {
        console.warn(
            `[meta-cloud-api] Template "${templateName}": rimossi ${removedHeaders} componenti header ` +
                `(expectedHeaderText=${expectedHeaderText}, allowImageHeader=${allowImageHeader}).`
        );
    }

    if (cleaned.length > 0) {
        const validationError = validateTemplateComponents(cleaned, {
            ...options,
            expectedHeaderTextParamCount: expectedHeaderText,
        });
        if (validationError) {
            console.warn(`[meta-cloud-api] Template validation: ${validationError}`);
            return { ok: false, error: validationError, errorCode: 132000 };
        }
    }

    const template: Record<string, unknown> = {
        name: templateName,
        language: { code: languageCode },
    };
    if (cleaned.length > 0) {
        template.components = cleaned;
    }

    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template' as const,
        template,
    };

    return postWhatsAppMessage(payload);
}

/**
 * Verifica credenziali Meta interrogando il phone number ID configurato.
 */
export async function getWhatsAppConnectionState(): Promise<WhatsAppConnectionState> {
    const config = resolveMetaCloudCredentials();
    if (!config.apiKey || !config.phoneNumberId) {
        const diag = getWhatsAppEnvDiagnostics();
        return {
            ok: false,
            state: 'not_configured',
            error: 'not_configured',
            missingEnv: diag.missing.filter((k) =>
                ['WHATSAPP_CLOUD_API_KEY', 'WHATSAPP_PHONE_NUMBER_ID'].includes(k)
            ),
        };
    }

    try {
        const url = graphApiUrl(
            `/${config.phoneNumberId}?fields=display_phone_number,verified_name`
        );
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${config.apiKey}` },
            cache: 'no-store',
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const parsed = parseMetaGraphError(body);
            console.error(
                `[meta-cloud-api] status ping HTTP ${res.status}:`,
                body.slice(0, 300)
            );
            return {
                ok: false,
                state: 'error',
                provider: 'meta_cloud',
                error: parsed.message || `http_${res.status}`,
            };
        }

        const data = (await res.json()) as { display_phone_number?: string };
        return {
            ok: true,
            state: 'open',
            provider: 'meta_cloud',
            displayPhoneNumber: data.display_phone_number,
        };
    } catch (e) {
        return {
            ok: false,
            state: 'error',
            provider: 'meta_cloud',
            error: e instanceof Error ? e.message : String(e),
        };
    }
}
