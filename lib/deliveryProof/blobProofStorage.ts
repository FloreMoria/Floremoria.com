import { del, get, head } from '@vercel/blob';
import { getBlobStoreAccess, putBlobWithAccessFallback } from '@/lib/blob/storeAccess';

/** Rimuove em-dash, ellipsis e altri non-ASCII che rompono fetch (ByteString). */
export function sanitizeAsciiUrl(raw: string): string {
    const value = raw
        .trim()
        .split(/[\s\u2013\u2014\u2026]/)[0]!
        .replace(/[^\x21-\x7E]/g, '');

    if (!value.startsWith('http://') && !value.startsWith('https://')) {
        throw new Error(
            'URL non valido: deve essere http(s):// e contenere solo caratteri ASCII.'
        );
    }
    return value;
}

function sanitizeBlobToken(raw: string): string {
    const token = raw.replace(/[^\x20-\x7E]/g, '').trim();
    if (!token) {
        throw new Error('[delivery-proof] BLOB_READ_WRITE_TOKEN non valido (caratteri non ASCII).');
    }
    return token;
}

function getBlobToken(): string {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
        throw new Error('[delivery-proof] BLOB_READ_WRITE_TOKEN mancante.');
    }
    return sanitizeBlobToken(token);
}

function pathnameFromBlobUrl(url: string): string {
    return new URL(url).pathname.replace(/^\//, '');
}

function isPrivateBlobUrl(url: string): boolean {
    return url.includes('private.blob.vercel-storage.com');
}

async function fetchPrivateBlobBuffer(url: string, token: string): Promise<Buffer> {
    const pathname = pathnameFromBlobUrl(url);
    const blobResult = await get(pathname, { access: getBlobStoreAccess(), token, useCache: false });
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
        throw new Error(
            `Impossibile scaricare la foto dal Blob privato (HTTP ${blobResult?.statusCode ?? 'n/a'}).`
        );
    }
    return Buffer.from(await new Response(blobResult.stream).arrayBuffer());
}

export async function fetchProofImageBuffer(url: string): Promise<Buffer> {
    const safeUrl = sanitizeAsciiUrl(url);
    const token = getBlobToken();

    if (isPrivateBlobUrl(safeUrl)) {
        return fetchPrivateBlobBuffer(safeUrl, token);
    }

    const res = await fetch(safeUrl, { cache: 'no-store' });
    if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
    }

    // Fallback: URL legacy (store pubblico o pathname noto) — prova private poi public.
    try {
        const meta = await head(safeUrl, { token });
        for (const access of ['private', 'public'] as const) {
            const blobResult = await get(meta.pathname, { access, token, useCache: false });
            if (blobResult?.stream && blobResult.statusCode === 200) {
                return Buffer.from(await new Response(blobResult.stream).arrayBuffer());
            }
        }
    } catch {
        // head/get falliti: usa errore fetch sotto
    }

    throw new Error(`Impossibile scaricare la foto dal Blob (HTTP ${res.status}).`);
}

export async function overwriteProofBlob(url: string, buffer: Buffer): Promise<string> {
    const token = getBlobToken();
    const meta = await head(sanitizeAsciiUrl(url), { token });
    const { url: updatedUrl } = await putBlobWithAccessFallback(meta.pathname, buffer, {
        contentType: 'image/webp',
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
    });
    return updatedUrl;
}

export async function deleteProofBlob(url: string): Promise<void> {
    await del(sanitizeAsciiUrl(url), { token: getBlobToken() });
}
