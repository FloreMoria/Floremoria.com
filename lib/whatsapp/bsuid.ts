/**
 * WhatsApp Business-Scoped User ID (BSUID) + username helpers.
 * Meta: BSUID formato `CC.alphanumeric` (es. IT.13491208655302741918).
 */

const BSUID_PATTERN = /^[A-Za-z]{2}\.[A-Za-z0-9]{1,128}$/;

/** True se il valore è un BSUID (anche con prefisso whatsapp:). */
export function isWhatsAppBsuid(raw: string | null | undefined): boolean {
    if (!raw?.trim()) return false;
    const cleaned = raw.replace(/^whatsapp:/i, '').trim();
    return BSUID_PATTERN.test(cleaned);
}

/** Normalizza BSUID senza prefisso whatsapp: (es. IT.abc123). */
export function normalizeWhatsAppBsuid(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null;
    const cleaned = raw.replace(/^whatsapp:/i, '').trim();
    if (!BSUID_PATTERN.test(cleaned)) return null;
    const [cc, rest] = cleaned.split('.');
    if (!cc || !rest) return null;
    return `${cc.toUpperCase()}.${rest}`;
}

/**
 * Chiave sessione chatStore: `whatsapp:+E164` oppure `whatsapp:bsuid:IT.xxx`.
 * Perché: le sessioni sono unique su phone; i BSUID non sono E.164.
 */
export function toWhatsAppSessionIdentityKey(input: {
    phoneE164?: string | null;
    bsuid?: string | null;
}): string | null {
    const e164 = input.phoneE164?.trim();
    if (e164) {
        const withPlus = e164.startsWith('+') ? e164 : `+${e164.replace(/^\+/, '')}`;
        return `whatsapp:${withPlus}`;
    }
    const bsuid = normalizeWhatsAppBsuid(input.bsuid);
    if (bsuid) return `whatsapp:bsuid:${bsuid}`;
    return null;
}

/** Estrae BSUID da chiave sessione `whatsapp:bsuid:…` o raw BSUID. */
export function sessionKeyToBsuid(sessionPhone: string | null | undefined): string | null {
    if (!sessionPhone?.trim()) return null;
    const raw = sessionPhone.trim();
    if (raw.toLowerCase().startsWith('whatsapp:bsuid:')) {
        return normalizeWhatsAppBsuid(raw.slice('whatsapp:bsuid:'.length));
    }
    return normalizeWhatsAppBsuid(raw);
}

export type MetaInboundContactLike = {
    wa_id?: string | null;
    user_id?: string | null;
    profile?: { name?: string | null; username?: string | null } | null;
};

export type MetaInboundMessageLike = {
    from?: string | null;
    from_user_id?: string | null;
    id?: string | null;
};

/**
 * Risolve mittente inbound: telefono e/o BSUID senza NPE se wa_id/from mancano.
 * Preferenza: from_user_id → from → contact.user_id → contact.wa_id
 */
export function resolveInboundWhatsAppSender(
    msg: MetaInboundMessageLike,
    contact?: MetaInboundContactLike | null
): {
    senderId: string | null;
    phoneCandidate: string | null;
    bsuid: string | null;
    waUsername: string | null;
    contactName: string | null;
} {
    const senderId =
        (typeof msg.from_user_id === 'string' && msg.from_user_id.trim()) ||
        (typeof msg.from === 'string' && msg.from.trim()) ||
        (typeof contact?.user_id === 'string' && contact.user_id.trim()) ||
        (typeof contact?.wa_id === 'string' && contact.wa_id.trim()) ||
        null;

    const candidates = [
        msg.from_user_id,
        msg.from,
        contact?.user_id,
        contact?.wa_id,
    ]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean);

    let bsuid: string | null = null;
    let phoneCandidate: string | null = null;

    for (const c of candidates) {
        if (!bsuid && isWhatsAppBsuid(c)) {
            bsuid = normalizeWhatsAppBsuid(c);
            continue;
        }
        if (!phoneCandidate && !isWhatsAppBsuid(c)) {
            phoneCandidate = c;
        }
    }

    // Se senderId è BSUID e non abbiamo ancora phone, ok.
    if (senderId && isWhatsAppBsuid(senderId) && !bsuid) {
        bsuid = normalizeWhatsAppBsuid(senderId);
    }
    if (senderId && !isWhatsAppBsuid(senderId) && !phoneCandidate) {
        phoneCandidate = senderId;
    }

    const waUsername =
        typeof contact?.profile?.username === 'string' && contact.profile.username.trim()
            ? contact.profile.username.trim().replace(/^@/, '').slice(0, 100)
            : null;

    const contactName =
        typeof contact?.profile?.name === 'string' && contact.profile.name.trim()
            ? contact.profile.name.trim()
            : null;

    return { senderId, phoneCandidate, bsuid, waUsername, contactName };
}
