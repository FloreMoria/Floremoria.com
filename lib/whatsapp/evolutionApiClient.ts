/**
 * Evolution API — Client HTTP proprietario FloreMoria.
 *
 * Documentazione: https://doc.evolution-api.com/
 * Istanza: process.env.EVOLUTION_INSTANCE_NAME
 * Base URL: process.env.EVOLUTION_API_BASE_URL
 * API Key: process.env.EVOLUTION_API_KEY
 *
 * Principio Set-and-Forget: le funzioni non rilanciano mai eccezioni verso il chiamante.
 */

export interface EvolutionSendResult {
    ok: boolean;
    messageId?: string;
    error?: string;
}

export interface EvolutionInstanceState {
    ok: boolean;
    state?: 'open' | 'connecting' | 'close' | 'refused';
    qrCodeBase64?: string;
    error?: string;
    /** Nomi variabili env assenti su Vercel (solo se error === not_configured). */
    missingEnv?: string[];
    instance?: string;
}

/**
 * Normalizza un numero di telefono grezzo in formato E.164 senza il prefisso «whatsapp:».
 * Esempi:
 *   "3204105305"       → "+393204105305"
 *   "+393204105305"    → "+393204105305"
 *   "393204105305"     → "+393204105305"
 *   "whatsapp:+39..." → "+39..."
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let p = raw.replace(/^whatsapp:/, '').replace(/[^\d+]/g, '').trim();
    if (!p) return null;
    if (p.startsWith('00')) p = `+${p.slice(2)}`;
    if (!p.startsWith('+')) {
        if (p.startsWith('39') && p.length >= 11) p = `+${p}`;
        else p = `+39${p}`;
    }
    if (!/^\+\d{8,15}$/.test(p)) return null;
    return p;
}

/**
 * Fallback produzione: Vercel Sensitive vars possono risultare undefined nel runtime
 * serverless nonostante siano configurate in dashboard.
 */
const PRODUCTION_EVOLUTION_FALLBACK = {
    baseUrl: 'http://94.177.198.140:8080',
    apiKey: 'd831cbb1697a8a7a42f03a49f51749f8ab8376d980fbc98be3b0f53818d460ae',
    instance: 'floremoria-iphone12',
} as const;

function isProductionRuntime(): boolean {
    return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function resolveEvolutionCredentials(): {
    baseUrl: string;
    apiKey: string;
    instance: string;
    usedProductionFallback: boolean;
} {
    let baseUrl = process.env.EVOLUTION_API_BASE_URL?.trim() ?? '';
    let apiKey = process.env.EVOLUTION_API_KEY?.trim() ?? '';
    let instance = process.env.EVOLUTION_INSTANCE_NAME?.trim() ?? '';

    const envIncomplete = !baseUrl || !apiKey;
    const usedProductionFallback = isProductionRuntime() && envIncomplete;

    if (usedProductionFallback) {
        if (!baseUrl) baseUrl = PRODUCTION_EVOLUTION_FALLBACK.baseUrl;
        if (!apiKey) apiKey = PRODUCTION_EVOLUTION_FALLBACK.apiKey;
        if (!instance) instance = PRODUCTION_EVOLUTION_FALLBACK.instance;
    }

    return {
        baseUrl: baseUrl.replace(/\/$/, ''),
        apiKey,
        instance: instance || 'floremoria',
        usedProductionFallback,
    };
}

/** Elenco env mancanti (solo nomi — per diagnostica admin, senza esporre segreti). */
export function getEvolutionEnvDiagnostics(): {
    configured: boolean;
    missing: string[];
    instance: string;
} {
    if (isMetaCloudConfigured()) {
        return { configured: true, missing: [], instance: 'whatsapp-meta-cloud' };
    }

    const creds = resolveEvolutionCredentials();
    const missing: string[] = [];
    if (!process.env.EVOLUTION_API_BASE_URL?.trim() && !creds.usedProductionFallback) {
        missing.push('EVOLUTION_API_BASE_URL');
    }
    if (!process.env.EVOLUTION_API_KEY?.trim() && !creds.usedProductionFallback) {
        missing.push('EVOLUTION_API_KEY');
    }
    const configured = Boolean(creds.baseUrl && creds.apiKey);
    return { configured, missing, instance: creds.instance };
}

function getEvolutionConfig(): { baseUrl: string; apiKey: string; instance: string } | null {
    const creds = resolveEvolutionCredentials();
    if (!creds.baseUrl || !creds.apiKey) return null;
    return { baseUrl: creds.baseUrl, apiKey: creds.apiKey, instance: creds.instance };
}

function resolveMetaCloudCredentials(): { apiKey: string; phoneNumberId: string } {
    return {
        apiKey: process.env.WHATSAPP_CLOUD_API_KEY?.trim() ?? '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '',
    };
}

function isMetaCloudConfigured(): boolean {
    const { apiKey, phoneNumberId } = resolveMetaCloudCredentials();
    return Boolean(apiKey && phoneNumberId);
}

async function sendMetaCloudTextMessage(
    phone: string,
    text: string
): Promise<EvolutionSendResult> {
    const config = resolveMetaCloudCredentials();
    const normalized = normalizePhoneE164(phone);
    if (!normalized) {
        console.warn(`[whatsapp-cloud-api] Numero non valido: "${phone}"`);
        return { ok: false, error: 'invalid_phone' };
    }

    const metaPhone = normalized.replace(/^\+/, '');
    const url = `https://graph.facebook.com/v19.0/${config.phoneNumberId}/messages`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: metaPhone,
                type: 'text',
                text: { preview_url: false, body: text },
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error(`[whatsapp-cloud-api] HTTP ${res.status} su messages:`, body.slice(0, 300));
            return { ok: false, error: `http_${res.status}` };
        }

        const data = (await res.json()) as { messages?: Array<{ id?: string }> };
        const messageId = data?.messages?.[0]?.id;
        console.info(`[whatsapp-cloud-api] Messaggio inviato a ${normalized} (id: ${messageId ?? 'N/A'})`);
        return { ok: true, messageId };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[whatsapp-cloud-api] Errore invio messaggio:', msg);
        return { ok: false, error: msg };
    }
}

async function sendEvolutionApiTextMessage(
    phone: string,
    text: string,
    config: { baseUrl: string; apiKey: string; instance: string }
): Promise<EvolutionSendResult> {
    const normalized = normalizePhoneE164(phone);
    if (!normalized) {
        console.warn(`[evolution-api] Numero non valido: "${phone}"`);
        return { ok: false, error: 'invalid_phone' };
    }

    const evolutionPhone = normalized.replace(/^\+/, '');
    const url = `${config.baseUrl}/message/sendText/${config.instance}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: config.apiKey,
            },
            body: JSON.stringify({
                number: evolutionPhone,
                text,
                options: { delay: 1200, presence: 'composing' },
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error(`[evolution-api] HTTP ${res.status} su sendText:`, body.slice(0, 300));
            return { ok: false, error: `http_${res.status}` };
        }

        const data = (await res.json()) as { key?: { id?: string }; messageId?: string };
        const messageId = data?.key?.id ?? data?.messageId;
        console.info(`[evolution-api] Messaggio inviato a ${normalized} (id: ${messageId ?? 'N/A'})`);
        return { ok: true, messageId };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[evolution-api] Errore invio messaggio:', msg);
        return { ok: false, error: msg };
    }
}

/**
 * Invia un messaggio di testo: Meta Cloud API se configurata, altrimenti Evolution API.
 */
export async function sendEvolutionTextMessage(
    phone: string,
    text: string
): Promise<EvolutionSendResult> {
    if (isMetaCloudConfigured()) {
        return sendMetaCloudTextMessage(phone, text);
    }

    const config = getEvolutionConfig();
    if (!config) {
        console.warn('[whatsapp] Nessun gateway configurato (Meta Cloud o Evolution): invio saltato.');
        return { ok: false, error: 'not_configured' };
    }

    return sendEvolutionApiTextMessage(phone, text, config);
}

/**
 * Recupera lo stato di connessione dell'istanza Evolution (aperta, in connessione, chiusa).
 */
export async function getEvolutionInstanceState(): Promise<EvolutionInstanceState> {
    if (isMetaCloudConfigured()) {
        return { ok: true, state: 'open', instance: 'whatsapp-meta-cloud' };
    }

    const config = getEvolutionConfig();
    if (!config) {
        const diag = getEvolutionEnvDiagnostics();
        return {
            ok: false,
            error: 'not_configured',
            missingEnv: diag.missing,
            instance: diag.instance,
        };
    }

    try {
        const url = `${config.baseUrl}/instance/connectionState/${config.instance}`;
        const res = await fetch(url, {
            headers: { apikey: config.apiKey },
            cache: 'no-store',
        });
        if (!res.ok) return { ok: false, error: `http_${res.status}` };
        const data = (await res.json()) as { instance?: { state?: string } };
        const state = data?.instance?.state as EvolutionInstanceState['state'];
        return { ok: true, state };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Recupera il QR code per collegare l'istanza al telefono.
 * Restituisce la stringa base64 dell'immagine PNG (senza il prefisso data:image/...).
 */
export async function getEvolutionQrCode(): Promise<EvolutionInstanceState> {
    if (isMetaCloudConfigured()) {
        return { ok: false, error: 'not_required', state: 'open', instance: 'whatsapp-meta-cloud' };
    }

    const config = getEvolutionConfig();
    if (!config) return { ok: false, error: 'not_configured' };

    try {
        const url = `${config.baseUrl}/instance/connect/${config.instance}`;
        const res = await fetch(url, {
            headers: { apikey: config.apiKey },
            cache: 'no-store',
        });
        if (!res.ok) return { ok: false, error: `http_${res.status}` };
        const data = (await res.json()) as { base64?: string; code?: string; pairingCode?: string };
        let qrCodeBase64 = data?.base64?.trim();
        if (!qrCodeBase64 && data?.code?.trim()) {
            const code = data.code.trim();
            // Evolution può restituire data URI o base64 puro
            qrCodeBase64 = code.startsWith('data:')
                ? code.replace(/^data:image\/[^;]+;base64,/, '')
                : code;
        }
        if (!qrCodeBase64) {
            return { ok: false, error: 'qr_not_available', state: 'connecting' };
        }
        return { ok: true, qrCodeBase64 };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
