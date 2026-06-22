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

function getEvolutionConfig(): { baseUrl: string; apiKey: string; instance: string } | null {
    const baseUrl = process.env.EVOLUTION_API_BASE_URL?.trim().replace(/\/$/, '');
    const apiKey = process.env.EVOLUTION_API_KEY?.trim();
    const instance = process.env.EVOLUTION_INSTANCE_NAME?.trim() || 'floremoria';
    if (!baseUrl || !apiKey) return null;
    return { baseUrl, apiKey, instance };
}

/**
 * Invia un messaggio di testo via Evolution API.
 * @param phone Numero destinatario (qualsiasi formato: viene normalizzato internamente)
 * @param text Testo del messaggio
 */
export async function sendEvolutionTextMessage(
    phone: string,
    text: string
): Promise<EvolutionSendResult> {
    const config = getEvolutionConfig();
    if (!config) {
        console.warn('[evolution-api] EVOLUTION_API_BASE_URL o EVOLUTION_API_KEY non configurati: invio saltato.');
        return { ok: false, error: 'not_configured' };
    }

    const normalized = normalizePhoneE164(phone);
    if (!normalized) {
        console.warn(`[evolution-api] Numero non valido: "${phone}"`);
        return { ok: false, error: 'invalid_phone' };
    }

    // Evolution API vuole il numero senza il "+": es. "393204105305"
    const evolutionPhone = normalized.replace(/^\+/, '');

    const url = `${config.baseUrl}/message/sendText/${config.instance}`;
    const payload = {
        number: evolutionPhone,
        text,
        options: {
            delay: 1200,      // ms di "sta scrivendo..." realistico
            presence: 'composing',
        },
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: config.apiKey,
            },
            body: JSON.stringify(payload),
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
 * Recupera lo stato di connessione dell'istanza Evolution (aperta, in connessione, chiusa).
 */
export async function getEvolutionInstanceState(): Promise<EvolutionInstanceState> {
    const config = getEvolutionConfig();
    if (!config) return { ok: false, error: 'not_configured' };

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
