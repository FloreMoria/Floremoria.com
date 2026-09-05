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
import { isWhatsAppBsuid, normalizeWhatsAppBsuid } from '@/lib/whatsapp/bsuid';

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

/**
 * Prefissi E.164 (ITU) — più lunghi prima per evitare ambiguità (351 vs 39, 505 vs 50…).
 * Include LATAM (505 Nicaragua, 506 CR, …), EU, NANP (+1), Asia/ME comuni.
 */
const COUNTRY_CALLING_CODES: readonly string[] = [
    '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229',
    '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243',
    '244', '245', '246', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258',
    '260', '261', '262', '263', '264', '265', '266', '267', '268', '269',
    '290', '291', '297', '298', '299',
    '350', '351', '352', '353', '354', '355', '356', '357', '358', '359',
    '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381', '382', '383', '385',
    '386', '387', '389',
    '420', '421', '423',
    '500', '501', '502', '503', '504', '505', '506', '507', '508', '509',
    '590', '591', '592', '593', '594', '595', '596', '597', '598', '599',
    '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '685',
    '686', '687', '688', '689', '690', '691', '692',
    '850', '852', '853', '855', '856', '880', '886',
    '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974',
    '975', '976', '977', '992', '993', '994', '995', '996', '998',
    '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48',
    '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
    '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
    '1', '7',
];

/** Mobile italiano senza prefisso internazionale: 10 cifre che iniziano con 3 (es. 3204910428). */
function isItalianMobileWithoutCountryCode(digits: string): boolean {
    return /^3\d{9}$/.test(digits);
}

/** NANP (USA/Canada): country 1 + 10 cifre NXX-NXX-XXXX. */
function isNanpDigits(digits: string): boolean {
    return /^1[2-9]\d{9}$/.test(digits);
}

/** Match prefisso paese su cifre grezze (senza +). Preferisce i codici più lunghi. */
function matchCountryCallingCode(digits: string): string | null {
    if (!digits || digits.length < 8 || digits.length > 15) return null;
    for (const code of COUNTRY_CALLING_CODES) {
        if (!digits.startsWith(code)) continue;
        const nationalLen = digits.length - code.length;
        if (nationalLen >= 6 && nationalLen <= 12) return code;
    }
    return null;
}

/**
 * Se qualcuno ha anteposto erroneamente +39 a un numero già internazionale
 * (es. +3917134834061 → +17134834061, +3950587013088 → +50587013088).
 * Non tocca i veri mobili IT (+3932…).
 */
function repairFalseItalianPrefix(e164: string): string {
    if (!e164.startsWith('+39') || e164.length < 12) return e164;
    const after39 = e164.slice(3);
    if (isItalianMobileWithoutCountryCode(after39)) return e164;
    if (isNanpDigits(after39)) return `+${after39}`;
    if (matchCountryCallingCode(after39) && !after39.startsWith('39')) {
        return `+${after39}`;
    }
    return e164;
}

/**
 * Normalizza un numero grezzo in E.164 (con prefisso +).
 *
 * Regole:
 * - Input con «+» o «00» → preserva il prefisso internazionale (poi ripara eventuali +39 spurî).
 * - Mobile IT 10 cifre (3…) → +39… (prima di match esteri tipo 32=Belgio).
 * - Prefisso paese ITU riconosciuto (1, 505, 44, …) → +cifre, mai +39 sopra.
 * - Solo altrimenti default Italia +39.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let p = raw.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '').trim();
    if (!p) return null;
    if (p.startsWith('00')) p = `+${p.slice(2)}`;

    if (p.startsWith('+')) {
        const digits = p.slice(1);
        if (isItalianMobileWithoutCountryCode(digits)) {
            p = `+39${digits}`;
        } else {
            p = `+${digits}`;
        }
    } else if (isItalianMobileWithoutCountryCode(p)) {
        p = `+39${p}`;
    } else if (p.startsWith('39') && isItalianMobileWithoutCountryCode(p.slice(2))) {
        p = `+${p}`;
    } else if (isNanpDigits(p) || matchCountryCallingCode(p)) {
        p = `+${p}`;
    } else {
        p = `+39${p}`;
    }

    p = repairFalseItalianPrefix(p);

    if (!/^\+\d{8,15}$/.test(p)) return null;
    return p;
}

/** Formato destinatario Meta Graph API: cifre internazionali senza + (es. 393204105305). */
export function toMetaRecipientPhone(phone: string): string | null {
    // BSUID non è un telefono: gestito da resolveMetaOutboundAddress → campo `recipient`.
    if (isWhatsAppBsuid(phone) || phone.toLowerCase().includes('bsuid:')) {
        return null;
    }
    const e164 = normalizePhoneE164(phone);
    if (!e164) return null;
    return e164.replace(/^\+/, '');
}

/**
 * Destinatario outbound Meta: `to` (telefono) e/o `recipient` (BSUID).
 * Se entrambi presenti, Meta dà precedenza a `to`.
 */
export function resolveMetaOutboundAddress(phoneOrBsuid: string): {
    to?: string;
    recipient?: string;
} | null {
    const raw = phoneOrBsuid.trim();
    if (!raw) return null;

    const bsuidFromKey = raw.toLowerCase().startsWith('whatsapp:bsuid:')
        ? normalizeWhatsAppBsuid(raw.slice('whatsapp:bsuid:'.length))
        : isWhatsAppBsuid(raw)
          ? normalizeWhatsAppBsuid(raw)
          : null;

    if (bsuidFromKey) {
        return { recipient: bsuidFromKey };
    }

    const to = toMetaRecipientPhone(raw);
    if (to) return { to };
    return null;
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
                recipient: payload.recipient,
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
        const recipient = String(payload.to ?? payload.recipient ?? '');
        console.info(`[meta-cloud-api] Messaggio inviato a ${recipient} (id: ${messageId ?? 'N/A'})`);
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
    const address = resolveMetaOutboundAddress(phone);
    if (!address) {
        console.warn(`[meta-cloud-api] Destinatario non valido: "${phone}"`);
        return {
            ok: false,
            error: 'invalid_phone: Numero di telefono o BSUID non valido.',
        };
    }

    const safeBody = safeTruncateUtf8(text, 4000);

    return postWhatsAppMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...(address.to ? { to: address.to } : {}),
        ...(address.recipient ? { recipient: address.recipient } : {}),
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
    const address = resolveMetaOutboundAddress(phone);
    if (!address) {
        console.warn(`[meta-cloud-api] Destinatario non valido: "${phone}"`);
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
        to: address.to ?? null,
        recipient: address.recipient ?? null,
        host: cleanLink.replace(/^https?:\/\/([^/]+).*/, '$1'),
        pathTail: cleanLink.slice(-48),
    });

    return postWhatsAppMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...(address.to ? { to: address.to } : {}),
        ...(address.recipient ? { recipient: address.recipient } : {}),
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
        const hasImageParam = header?.parameters?.some((p) => p.type === 'image');
        if (!hasImageParam) {
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
    const address = resolveMetaOutboundAddress(phone);
    if (!address) {
        console.warn(`[meta-cloud-api] Destinatario non valido: "${phone}"`);
        return { ok: false, error: 'invalid_phone' };
    }

    const expectedHeaderText = options?.expectedHeaderTextParamCount ?? 0;
    const allowImageHeader = Boolean(options?.allowImageHeader);
    const hasImageHeaderParam = components.some(
        (c) => c.type === 'header' && c.parameters?.some((p) => p.type === 'image')
    );
    const headerAllowed = expectedHeaderText > 0 || allowImageHeader || hasImageHeaderParam;

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
                `(expectedHeaderText=${expectedHeaderText}, allowImageHeader=${allowImageHeader}, hasImageHeaderParam=${hasImageHeaderParam}).`
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
        ...(address.to ? { to: address.to } : {}),
        ...(address.recipient ? { recipient: address.recipient } : {}),
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
