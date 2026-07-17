/**
 * Upload immagini di chat WhatsApp (inviate dallo staff o inoltrate tra conversazioni)
 * su Vercel Blob, restituendo un URL pubblico che i server Meta possono scaricare
 * per il messaggio `image` (stesso store/pipeline delle prove di consegna).
 */
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { normalizeProofImageBuffer } from '@/lib/deliveryProof/imagePipeline';

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

/** Normalizza (EXIF/orientamento, WebP) e carica un buffer immagine su Blob. */
export async function uploadChatImageBuffer(buffer: Buffer, sessionPhone: string): Promise<string> {
    let optimized: Buffer;
    try {
        optimized = await normalizeProofImageBuffer(buffer);
    } catch (err) {
        console.error('[chat-media] Sharp failed:', err);
        throw new Error('Impossibile elaborare l\'immagine. Usa JPG, PNG, WebP o HEIC.');
    }

    const folder = sessionPhone.replace(/[^\d]/g, '') || 'chat';
    const blobPath = `${CHAT_MEDIA_PREFIX}/${folder}/${Date.now()}.webp`;

    const { url } = await putBlobWithAccessFallback(blobPath, optimized, {
        contentType: 'image/webp',
        token: getBlobToken(),
        addRandomSuffix: true,
    });

    return url;
}
