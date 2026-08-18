import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import {
    isWhatsAppBsuid,
    normalizeWhatsAppBsuid,
    sessionKeyToBsuid,
    toWhatsAppSessionIdentityKey,
} from '@/lib/whatsapp/bsuid';

/** Chiave sessione chatStore / WhatsAppChatSession (es. whatsapp:+393331112222). */
export function toWhatsAppSessionPhone(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null;

    // Sessione già in forma bsuid.
    if (raw.toLowerCase().startsWith('whatsapp:bsuid:')) {
        const bsuid = sessionKeyToBsuid(raw);
        return bsuid ? `whatsapp:bsuid:${bsuid}` : null;
    }

    if (isWhatsAppBsuid(raw)) {
        const bsuid = normalizeWhatsAppBsuid(raw);
        return bsuid ? `whatsapp:bsuid:${bsuid}` : null;
    }

    const e164 = normalizePhoneE164(raw);
    if (!e164) return null;
    return `whatsapp:${e164}`;
}

/** E.164 da chiave sessione (null se sessione solo BSUID). */
export function sessionPhoneToE164(sessionPhone: string): string | null {
    if (sessionPhone.toLowerCase().includes('bsuid:')) return null;
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

export { toWhatsAppSessionIdentityKey };
