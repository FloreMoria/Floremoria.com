/** Normalizza URL media chat (legacy /api/admin → /api/dashboard). */
export function resolveWhatsAppChatMediaUrl(mediaUrl: string | null | undefined): string | null {
    const value = mediaUrl?.trim();
    if (!value) return null;

    const match = value.match(/\/api\/(?:admin|dashboard)\/whatsapp\/media\/([^/?#]+)/i);
    if (match?.[1]) {
        return `/api/dashboard/whatsapp/media/${match[1]}`;
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
    return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(value) || value.includes('/whatsapp/media/');
}
