/**
 * Normalizza URL immagine per Meta Cloud API (link HTTPS pubblico).
 * Perché: query string, WebP/HEIC e Blob privati fanno fallire l'anteprima WhatsApp sull'utente.
 */

import { getBlobStoreAccess } from '@/lib/blob/storeAccess';

/** Rimuove query/hash e caratteri non ASCII che rompono il fetch Meta. */
export function stripUrlQueryAndFragment(raw: string): string {
    const trimmed = raw.trim().replace(/[^\x21-\x7E]/g, '');
    try {
        const u = new URL(trimmed);
        return `${u.origin}${u.pathname}`;
    } catch {
        return trimmed.split('?')[0]?.split('#')[0] || trimmed;
    }
}

/**
 * Preferisce URL Blob pubblico JPEG pulito; altrimenti null → usare /api/chat/media.
 */
export function preferDirectPublicJpegForMeta(blobUrl: string): string | null {
    const clean = stripUrlQueryAndFragment(blobUrl);
    if (!/^https:\/\//i.test(clean)) return null;
    if (/private\.blob\.vercel-storage\.com/i.test(clean)) return null;
    if (getBlobStoreAccess() === 'private' && /blob\.vercel-storage\.com/i.test(clean)) {
        // Store privato: Meta non può leggere il Blob diretto → serve proxy pubblico.
        return null;
    }
    if (/\.jpe?g$/i.test(clean) && /public\.blob\.vercel-storage\.com/i.test(clean)) {
        return clean;
    }
    return null;
}
