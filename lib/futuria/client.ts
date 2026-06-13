/**
 * Client HTTP Futuria CRM API v2 (LeadConnector / GHL).
 * Upsert contatti + invio messaggi su canali Email / WhatsApp.
 */
import {
    getFuturiaApiBase,
    getFuturiaApiKey,
    getFuturiaApiVersion,
    getFuturiaLocationId,
    getFuturiaBusinessWhatsAppPhone,
    isFuturiaConfigured,
} from './config';

export type FuturiaMessageType = 'Email' | 'WhatsApp' | 'SMS';

export interface FuturiaUpsertContactInput {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    tags?: string[];
}

export interface FuturiaSendEmailInput {
    contactId: string;
    emailFrom: string;
    subject: string;
    html: string;
    text?: string;
    emailBcc?: string[];
    replyTo?: string;
}

export interface FuturiaSendWhatsAppInput {
    contactId: string;
    message?: string;
    toNumber?: string;
    /** Template Meta approvato (richiesto per messaggi business-initiated fuori 24h). */
    templateId?: string;
    /** URL pubblici immagine/documento (foto testimonianza fiorista). */
    attachments?: string[];
}

/** Pulsante CTA URL WhatsApp (Meta interactive cta_url) — nasconde l'URL nel corpo. */
export interface FuturiaSendWhatsAppCtaInput {
    contactId: string;
    body: string;
    buttonText: string;
    url: string;
    footer?: string;
}

export class FuturiaApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body?: string
    ) {
        super(message);
        this.name = 'FuturiaApiError';
    }
}

function splitFullName(fullName: string | undefined): { firstName?: string; lastName?: string } {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return {};
    if (parts.length === 1) return { firstName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Normalizza telefono italiano in E.164 per Futuria (+39...). */
export function normalizeFuturiaPhone(raw: string | null | undefined): string | null {
    let p = (raw || '').replace(/[^\d+]/g, '').trim();
    if (!p) return null;
    if (p.startsWith('00')) p = `+${p.slice(2)}`;
    if (!p.startsWith('+')) {
        if (p.startsWith('39')) p = `+${p}`;
        else p = `+39${p}`;
    }
    if (!/^\+\d{8,15}$/.test(p)) return null;
    return p;
}

/** True se il destinatario coincide con la linea WhatsApp business (Meta rifiuta l'invio). */
export function isSameAsBusinessWhatsAppPhone(raw: string | null | undefined): boolean {
    const target = normalizeFuturiaPhone(raw);
    const business = normalizeFuturiaPhone(getFuturiaBusinessWhatsAppPhone());
    if (!target || !business) return false;
    return target === business;
}

export interface FuturiaMessageRecord {
    id?: string;
    status?: string;
    error?: string;
    direction?: string;
}

/** Legge stato reale consegna messaggio (queued ≠ delivered). */
export async function getFuturiaMessage(messageId: string): Promise<FuturiaMessageRecord | null> {
    const data = await futuriaFetch<{ message?: FuturiaMessageRecord }>(
        `/conversations/messages/${messageId}`,
        { method: 'GET' }
    );
    return data.message ?? null;
}

async function waitForFuturiaMessageStatus(
    messageId: string,
    maxAttempts = 4,
    delayMs = 800
): Promise<FuturiaMessageRecord | null> {
    for (let i = 0; i < maxAttempts; i += 1) {
        const record = await getFuturiaMessage(messageId);
        if (!record) return null;
        const status = record.status?.toLowerCase();
        if (status && status !== 'pending' && status !== 'queued') {
            return record;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return getFuturiaMessage(messageId);
}

async function futuriaFetch<T>(path: string, init: RequestInit): Promise<T> {
    const apiKey = getFuturiaApiKey();
    if (!apiKey) throw new FuturiaApiError('FUTURIA_API_KEY mancante', 0);

    const res = await fetch(`${getFuturiaApiBase()}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            Version: getFuturiaApiVersion(),
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers || {}),
        },
    });

    const text = await res.text();
    if (!res.ok) {
        throw new FuturiaApiError(
            `Futuria API ${path} → HTTP ${res.status}`,
            res.status,
            text.slice(0, 800)
        );
    }

    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
}

/** Crea o aggiorna un contatto nella location Futuria configurata. */
export async function upsertFuturiaContact(input: FuturiaUpsertContactInput): Promise<string> {
    const locationId = getFuturiaLocationId();
    if (!locationId) throw new FuturiaApiError('FUTURIA_LOCATION_ID mancante', 0);

    const nameParts = splitFullName(input.name);
    const body: Record<string, unknown> = {
        locationId,
        ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.firstName || nameParts.firstName
            ? { firstName: input.firstName || nameParts.firstName }
            : {}),
        ...(input.lastName || nameParts.lastName
            ? { lastName: input.lastName || nameParts.lastName }
            : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
    };

    const data = await futuriaFetch<{ contact?: { id?: string }; id?: string }>(
        '/contacts/upsert',
        { method: 'POST', body: JSON.stringify(body) }
    );

    const contactId = data.contact?.id || data.id;
    if (!contactId) {
        throw new FuturiaApiError('Upsert contatto Futuria senza contactId in risposta', 200);
    }
    return contactId;
}

export async function sendFuturiaEmail(input: FuturiaSendEmailInput): Promise<{ messageId?: string }> {
    const payload: Record<string, unknown> = {
        type: 'Email',
        contactId: input.contactId,
        emailFrom: input.emailFrom,
        subject: input.subject,
        html: input.html,
        message: input.text || input.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        status: 'pending',
        ...(input.emailBcc?.length ? { emailBcc: input.emailBcc } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    };

    const data = await futuriaFetch<{ messageId?: string; id?: string }>('/conversations/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    return { messageId: data.messageId || data.id };
}

export async function sendFuturiaWhatsApp(
    input: FuturiaSendWhatsAppInput
): Promise<{ messageId?: string; deliveryStatus?: string; deliveryError?: string }> {
    if (!input.templateId && !input.message?.trim() && !input.attachments?.length) {
        throw new FuturiaApiError('WhatsApp richiede message, templateId o attachments', 0);
    }

    const payload: Record<string, unknown> = {
        type: 'WhatsApp',
        contactId: input.contactId,
        ...(input.templateId ? { templateId: input.templateId } : {}),
        ...(input.message?.trim() ? { message: input.message.trim() } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
        ...(input.toNumber ? { toNumber: input.toNumber } : {}),
    };

    const data = await futuriaFetch<{ messageId?: string; id?: string }>('/conversations/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const messageId = data.messageId || data.id;
    if (!messageId) {
        return { messageId: undefined };
    }

    const record = await waitForFuturiaMessageStatus(messageId);
    return {
        messageId,
        deliveryStatus: record?.status,
        deliveryError: record?.error,
    };
}

/**
 * Prova invio WhatsApp con pulsante CTA URL (testo "FOTO" / "Clicca qui").
 * Futuria/GHL potrebbe non esporre l'endpoint via API — in caso di errore il chiamante fa fallback testuale.
 */
export async function sendFuturiaWhatsAppCtaUrl(
    input: FuturiaSendWhatsAppCtaInput
): Promise<{ messageId?: string; deliveryStatus?: string; deliveryError?: string }> {
    const buttonText = input.buttonText.trim().slice(0, 20) || 'FOTO';

    const payload: Record<string, unknown> = {
        type: 'WhatsApp',
        contactId: input.contactId,
        message: input.body.trim(),
        whatsapp: {
            type: 'interactive',
            interactive: {
                type: 'cta_url',
                body: { text: input.body.trim() },
                ...(input.footer?.trim() ? { footer: { text: input.footer.trim() } } : {}),
                action: {
                    name: 'cta_url',
                    parameters: {
                        display_text: buttonText,
                        url: input.url.trim(),
                    },
                },
            },
        },
    };

    const data = await futuriaFetch<{ messageId?: string; id?: string }>('/conversations/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const messageId = data.messageId || data.id;
    if (!messageId) {
        return { messageId: undefined };
    }

    const record = await waitForFuturiaMessageStatus(messageId);
    return {
        messageId,
        deliveryStatus: record?.status,
        deliveryError: record?.error,
    };
}

export async function ensureFuturiaContactForRecipient(
    recipientEmail: string,
    displayName?: string
): Promise<string> {
    return upsertFuturiaContact({
        email: recipientEmail,
        name: displayName,
        tags: ['floremoria-transactional'],
    });
}

export { isFuturiaConfigured };
