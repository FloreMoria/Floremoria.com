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

const META_GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v21.0';

export interface WhatsAppSendResult {
    ok: boolean;
    messageId?: string;
    error?: string;
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
 * Normalizza un numero grezzo in E.164 (con prefisso +).
 * Meta invia `from` come cifre internazionali senza +; l'output è sempre +39…
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

/** Formato destinatario Meta Graph API: cifre internazionali senza + (es. 393204105305). */
export function toMetaRecipientPhone(phone: string): string | null {
    const e164 = normalizePhoneE164(phone);
    if (!e164) return null;
    return e164.replace(/^\+/, '');
}

export function resolveMetaCloudCredentials(): MetaCloudCredentials {
    return {
        apiKey: process.env.WHATSAPP_CLOUD_API_KEY?.trim() ?? '',
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
    if (!process.env.WHATSAPP_CLOUD_API_KEY?.trim()) missing.push('WHATSAPP_CLOUD_API_KEY');
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!process.env.WHATSAPP_WEBHOOK_SECRET?.trim()) missing.push('WHATSAPP_WEBHOOK_SECRET');
    if (!process.env.WHATSAPP_APP_SECRET?.trim()) missing.push('WHATSAPP_APP_SECRET');
    return { configured: missing.length === 0, missing };
}

function graphApiUrl(path: string): string {
    return `https://graph.facebook.com/${META_GRAPH_API_VERSION}${path}`;
}

/**
 * Invia un messaggio di testo via Meta WhatsApp Cloud API.
 */
export async function sendWhatsAppTextMessage(
    phone: string,
    text: string
): Promise<WhatsAppSendResult> {
    const config = resolveMetaCloudCredentials();
    if (!config.apiKey || !config.phoneNumberId) {
        console.warn('[meta-cloud-api] WHATSAPP_CLOUD_API_KEY o WHATSAPP_PHONE_NUMBER_ID assenti: invio saltato.');
        return { ok: false, error: 'not_configured' };
    }

    const recipient = toMetaRecipientPhone(phone);
    if (!recipient) {
        console.warn(`[meta-cloud-api] Numero non valido: "${phone}"`);
        return { ok: false, error: 'invalid_phone' };
    }

    const url = graphApiUrl(`/${config.phoneNumberId}/messages`);

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
                to: recipient,
                type: 'text',
                text: { preview_url: false, body: text },
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error(`[meta-cloud-api] HTTP ${res.status} messages:`, body.slice(0, 300));
            return { ok: false, error: `http_${res.status}` };
        }

        const data = (await res.json()) as { messages?: Array<{ id?: string }> };
        const messageId = data?.messages?.[0]?.id;
        console.info(`[meta-cloud-api] Messaggio inviato a +${recipient} (id: ${messageId ?? 'N/A'})`);
        return { ok: true, messageId };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[meta-cloud-api] Errore invio messaggio:', msg);
        return { ok: false, error: msg };
    }
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
            return { ok: false, state: 'error', provider: 'meta_cloud', error: `http_${res.status}` };
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
