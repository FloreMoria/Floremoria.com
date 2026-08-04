/**
 * Normalizzazione unica degli ID messaggio Meta WhatsApp (wamid).
 * Perché: invio e webhook `statuses` devono confrontare la stessa forma canonica;
 * Meta di solito include il prefisso `wamid.`, ma varianti senza prefisso o con
 * whitespace rompono il match su metadata JSON.
 */

const WAMID_PREFIX = 'wamid.';

/** Forma canonica con prefisso `wamid.` (o null se vuoto). */
export function normalizeWamid(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const cleaned = raw.trim().replace(/\s+/g, '');
    if (!cleaned) return null;
    if (cleaned.startsWith(WAMID_PREFIX)) return cleaned;
    // Corpo tipico Meta (base64-like) senza prefisso → allinea a Cloud API.
    if (/^[A-Za-z0-9+/=_-]+$/.test(cleaned) && cleaned.length >= 20) {
        return `${WAMID_PREFIX}${cleaned}`;
    }
    return cleaned;
}

/** Varianti da usare in lookup DB (con/senza prefisso + raw). */
export function wamidLookupVariants(raw: string | null | undefined): string[] {
    const trimmed = raw?.trim();
    if (!trimmed) return [];
    const normalized = normalizeWamid(trimmed);
    const without =
        normalized?.startsWith(WAMID_PREFIX) ? normalized.slice(WAMID_PREFIX.length) : normalized;
    const withPrefix =
        normalized && !normalized.startsWith(WAMID_PREFIX)
            ? `${WAMID_PREFIX}${normalized}`
            : normalized;
    return [...new Set([trimmed, normalized, withPrefix, without].filter(Boolean) as string[])];
}

export function wamidsMatch(
    a: string | null | undefined,
    b: string | null | undefined
): boolean {
    const left = wamidLookupVariants(a);
    if (left.length === 0) return false;
    const right = new Set(wamidLookupVariants(b));
    return left.some((v) => right.has(v));
}

export type WhatsAppDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

const STATUS_RANK: Record<WhatsAppDeliveryStatus, number> = {
    FAILED: 0,
    SENT: 1,
    DELIVERED: 2,
    READ: 3,
};

/** Evita downgrade (es. READ → DELIVERED) su callback fuori ordine / retry Meta. */
export function shouldApplyDeliveryStatus(
    current: string | null | undefined,
    next: WhatsAppDeliveryStatus
): boolean {
    if (!current) return true;
    const cur = current.toUpperCase() as WhatsAppDeliveryStatus;
    if (cur === next) return true;
    if (next === 'FAILED') return cur !== 'READ';
    return (STATUS_RANK[next] ?? 0) >= (STATUS_RANK[cur] ?? 0);
}

/**
 * Metadata outbound allineati a webhook status: stesso wamid normalizzato + SENT iniziale.
 * Valori tipizzati come string per addMessage (Record<string, string>).
 */
export function buildOutboundWamidMetadata(
    messageId: string | null | undefined
): Record<string, string> {
    const wamid = normalizeWamid(messageId);
    if (!wamid) return {};
    return {
        whatsAppMessageId: wamid,
        wamid,
        deliveryStatus: 'SENT',
        deliveryStatusUpdatedAt: new Date().toISOString(),
    };
}
