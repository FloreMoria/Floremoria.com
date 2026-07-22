/**
 * Upload immagini di chat WhatsApp (inviate dallo staff o inoltrate tra conversazioni)
 * su Vercel Blob come JPEG: Meta Cloud API non mostra in modo affidabile i WebP via link.
 */
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import sharp from 'sharp';

const CHAT_MEDIA_PREFIX = 'floremoria-media/whatsapp-chat';

function getBlobToken(): string {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
        throw new Error(
            '[chat-media] BLOB_READ_WRITE_TOKEN mancante. Configura Vercel Blob (stesso store delle prove di consegna).'
        );
    }
    return token;
}

/**
 * Normalizza (EXIF/orientamento) ed esporta JPEG pubblico scaricabile da Meta.
 */
export async function uploadChatImageBuffer(buffer: Buffer, sessionPhone: string): Promise<string> {
    let optimized: Buffer;
    try {
        optimized = await sharp(buffer, { failOn: 'none' })
            .rotate()
            .jpeg({ quality: 90, progressive: true, mozjpeg: true })
            .toBuffer();
    } catch (err) {
        console.error('[chat-media] Sharp failed:', err);
        throw new Error('Impossibile elaborare l\'immagine. Usa JPG, PNG, WebP o HEIC.');
    }

    const folder = sessionPhone.replace(/[^\d]/g, '') || 'chat';
    const blobPath = `${CHAT_MEDIA_PREFIX}/${folder}/${Date.now()}.jpg`;

    const { url } = await putBlobWithAccessFallback(blobPath, optimized, {
        contentType: 'image/jpeg',
        token: getBlobToken(),
        addRandomSuffix: true,
    });

    return url;
}

/**
 * Riconverte un URL immagine già su Blob (es. WebP legacy) in JPEG pubblico per WhatsApp.
 */
export async function ensureWhatsAppChatImageJpegUrl(
    imageUrl: string,
    sessionPhone: string
): Promise<string> {
    if (/\.jpe?g(\?|$)/i.test(imageUrl) && /public\.blob\.vercel-storage\.com/i.test(imageUrl)) {
        return imageUrl;
    }

    const res = await fetch(imageUrl);
    if (!res.ok) {
        throw new Error(`Impossibile scaricare immagine chat (HTTP ${res.status}).`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return uploadChatImageBuffer(buffer, sessionPhone);
}
