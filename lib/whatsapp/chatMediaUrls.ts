/** Normalizza URL media chat (legacy /api/admin → /api/dashboard; staging → proxy staff; blob privato → proxy). */
export function resolveWhatsAppChatMediaUrl(mediaUrl: string | null | undefined): string | null {
    const value = mediaUrl?.trim();
    if (!value) return null;

    const chatMediaMatch = value.match(/\/api\/chat\/media\/([^/?#]+)/i);
    if (chatMediaMatch?.[1]) {
        return `/api/dashboard/whatsapp/delivery-staging/${chatMediaMatch[1]}`;
    }

    const stagingMatch = value.match(/\/api\/whatsapp\/delivery-staging\/([^/?#]+)/i);
    if (stagingMatch?.[1]) {
        return `/api/dashboard/whatsapp/delivery-staging/${stagingMatch[1]}`;
    }

    const match = value.match(/\/api\/(?:admin|dashboard)\/whatsapp\/media\/([^/?#]+)/i);
    if (match?.[1]) {
        return `/api/dashboard/whatsapp/media/${match[1]}`;
    }

    // Blob privato: non caricabile in <img> diretto → proxy dashboard autenticato.
    if (value.includes('private.blob.vercel-storage.com')) {
        return `/api/dashboard/campaigns/media?url=${encodeURIComponent(value)}`;
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
    }

    return value.startsWith('/') ? value : `/${value}`;
}

export function whatsAppChatMediaDownloadUrl(mediaUrl: string | null | undefined): string | null {
    const resolved = resolveWhatsAppChatMediaUrl(mediaUrl);
    if (!resolved) return null;
    if (!resolved.includes('/api/dashboard/whatsapp/media/')) {
        return resolved;
    }
    const separator = resolved.includes('?') ? '&' : '?';
    return `${resolved}${separator}download=1`;
}

export function isImageMediaUrl(mediaUrl: string | null | undefined): boolean {
    const value = mediaUrl?.trim();
    if (!value) return false;
    return (
        /\.(jpe?g|png|gif|webp)(\?|$)/i.test(value) ||
        value.includes('/whatsapp/media/') ||
        value.includes('/whatsapp/delivery-staging/') ||
        value.includes('/api/chat/media/') ||
        value.includes('blob.vercel-storage.com')
    );
}

/** Estrae il media ID Meta da un URL proxy (/api/dashboard/whatsapp/media/{id}), altrimenti null. */
export function extractWhatsAppMediaId(mediaUrl: string | null | undefined): string | null {
    const value = mediaUrl?.trim();
    if (!value) return null;
    const match = value.match(/\/api\/(?:admin|dashboard)\/whatsapp\/media\/([^/?#]+)/i);
    return match?.[1] ?? null;
}
