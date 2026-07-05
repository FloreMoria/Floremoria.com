import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';

/** Chiave sessione chatStore / WhatsAppChatSession (es. whatsapp:+393331112222). */
export function toWhatsAppSessionPhone(raw: string | null | undefined): string | null {
    const e164 = normalizePhoneE164(raw);
    if (!e164) return null;
    return `whatsapp:${e164}`;
}

/** E.164 da chiave sessione. */
export function sessionPhoneToE164(sessionPhone: string): string | null {
    return normalizePhoneE164(sessionPhone);
}

export function buildContactInitials(name: string): string {
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'UT';
    return parts
        .map((w) => w[0]?.toUpperCase() ?? '')
        .slice(0, 2)
        .join('');
}
