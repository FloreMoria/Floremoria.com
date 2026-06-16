import { del, head, put } from '@vercel/blob';

function getBlobToken(): string {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
        throw new Error('[delivery-proof] BLOB_READ_WRITE_TOKEN mancante.');
    }
    return token;
}

export async function fetchProofImageBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error('Impossibile scaricare la foto dal Blob.');
    }
    return Buffer.from(await res.arrayBuffer());
}

export async function overwriteProofBlob(url: string, buffer: Buffer): Promise<string> {
    const token = getBlobToken();
    const meta = await head(url, { token });
    const { url: updatedUrl } = await put(meta.pathname, buffer, {
        access: 'public',
        contentType: 'image/webp',
        token,
        addRandomSuffix: false,
    });
    return updatedUrl;
}

export async function deleteProofBlob(url: string): Promise<void> {
    await del(url, { token: getBlobToken() });
}
