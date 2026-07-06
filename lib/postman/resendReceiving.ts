/**
 * Resend Inbound — recupero contenuto email e verifica webhook (Svix).
 * Il payload `email.received` contiene solo metadati: il body va scaricato via API.
 */
import crypto from 'crypto';

export interface ResendReceivedEmail {
    id: string;
    from: string;
    to: string[];
    subject: string;
    text: string | null;
    html: string | null;
    message_id: string | null;
    headers: Record<string, string>;
}

export interface ResendEmailReceivedEvent {
    type: 'email.received';
    created_at?: string;
    data: {
        email_id: string;
        from: string;
        to: string[];
        subject?: string;
        message_id?: string;
        received_for?: string[];
    };
}

function getResendApiKey(): string {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error('RESEND_API_KEY non configurata.');
    return key;
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function parseResendFromHeader(raw: string): { fromName: string; fromEmail: string } {
    const value = raw.trim();
    const angle = value.match(/^(.*)<([^>]+)>$/);
    if (angle) {
        return {
            fromName: angle[1].replace(/"/g, '').trim(),
            fromEmail: angle[2].trim().toLowerCase(),
        };
    }
    return { fromName: '', fromEmail: value.toLowerCase() };
}

/** Scarica testo/HTML/headers di una email ricevuta su Resend. */
export async function fetchResendReceivedEmail(emailId: string): Promise<ResendReceivedEmail> {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
        headers: { Authorization: `Bearer ${getResendApiKey()}` },
    });

    if (!res.ok) {
        const detail = (await res.text()).slice(0, 400);
        throw new Error(`Resend receiving GET ${res.status}: ${detail}`);
    }

    const json = (await res.json()) as ResendReceivedEmail & { message_id?: string };
    return json;
}

export function extractPlainTextFromResendEmail(email: ResendReceivedEmail): string {
    if (email.text?.trim()) return email.text.trim();
    if (email.html?.trim()) return stripHtml(email.html);
    return '';
}

export function isAssistenzaRecipient(addresses: string[]): boolean {
    const assistenza = (process.env.ASSISTENZA_EMAIL_USER || 'assistenza@floremoria.com')
        .trim()
        .toLowerCase();
    return addresses.some((a) => a.trim().toLowerCase() === assistenza);
}

/**
 * Verifica firma Svix inviata da Resend (header svix-id, svix-timestamp, svix-signature).
 * https://docs.svix.com/receiving/verifying-payloads/how
 */
export function verifyResendSvixWebhook(params: {
    rawBody: string;
    svixId: string;
    svixTimestamp: string;
    svixSignature: string;
    secret: string;
}): boolean {
    const { rawBody, svixId, svixTimestamp, svixSignature, secret } = params;
    if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;

    const ts = Number(svixTimestamp);
    if (!Number.isFinite(ts)) return false;
    const ageSec = Math.abs(Date.now() / 1000 - ts);
    if (ageSec > 300) return false;

    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const secretBytes = secret.startsWith('whsec_')
        ? Buffer.from(secret.slice('whsec_'.length), 'base64')
        : Buffer.from(secret, 'utf8');

    const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

    const signatures = svixSignature.split(' ').map((part) => {
        const [version, sig] = part.split(',');
        return version === 'v1' ? sig : null;
    }).filter(Boolean) as string[];

    return signatures.some((sig) => {
        try {
            const a = Buffer.from(sig, 'base64');
            const b = Buffer.from(expected, 'base64');
            return a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch {
            return false;
        }
    });
}

export function isResendEmailReceivedEvent(body: unknown): body is ResendEmailReceivedEvent {
    return (
        typeof body === 'object' &&
        body !== null &&
        (body as ResendEmailReceivedEvent).type === 'email.received' &&
        typeof (body as ResendEmailReceivedEvent).data?.email_id === 'string'
    );
}
