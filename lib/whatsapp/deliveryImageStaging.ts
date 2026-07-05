import { fetchProofImageBuffer } from '@/lib/deliveryProof/blobProofStorage';
import sharp from 'sharp';
import {
    createStagingToken,
    getSiteBaseUrl,
    stagingPathnameToBlobUrl,
} from '@/lib/whatsapp/mediaStagingShared';

const DELIVERY_STAGING_PREFIX = 'whatsapp/delivery-staging';
const STAGING_TTL_MS = 20 * 60 * 1000;

function sanitizeOrderKey(orderId: string): string {
    return orderId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
}

/**
 * Espone la foto Blob privata tramite URL HTTPS pubblico temporaneo (HMAC).
 * Meta Cloud API scarica l'immagine da /api/whatsapp/delivery-staging/[token].
 */
export async function ensureWhatsAppDeliveryImageUrl(
    orderId: string,
    imageUrl: string
): Promise<string> {
    if (imageUrl.includes('public.blob.vercel-storage.com')) {
        return imageUrl;
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN?.replace(/[^\x20-\x7E]/g, '').trim();
    if (!token) {
        throw new Error('BLOB_READ_WRITE_TOKEN mancante per esporre foto consegna a Meta.');
    }

    const sourceBytes = await fetchProofImageBuffer(imageUrl);
    const jpegBytes = await sharp(sourceBytes, { failOn: 'none' })
        .rotate()
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();

    const pathname = `${DELIVERY_STAGING_PREFIX}/${sanitizeOrderKey(orderId)}.jpg`;
    const { putBlobWithAccessFallback } = await import('@/lib/blob/storeAccess');
    await putBlobWithAccessFallback(pathname, jpegBytes, {
        contentType: 'image/jpeg',
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
    });

    const expiresAt = Date.now() + STAGING_TTL_MS;
    const stagingToken = createStagingToken(pathname, expiresAt);
    return `${getSiteBaseUrl()}/api/whatsapp/delivery-staging/${stagingToken}`;
}

export { DELIVERY_STAGING_PREFIX, stagingPathnameToBlobUrl };
