import { fetchProofImageBuffer } from '@/lib/deliveryProof/blobProofStorage';
import sharp from 'sharp';
import {
    createStagingToken,
    getSiteBaseUrl,
    stagingPathnameToBlobUrl,
} from '@/lib/whatsapp/mediaStagingShared';

const DELIVERY_STAGING_PREFIX = 'whatsapp/delivery-staging';
const STAGING_TTL_MS = 60 * 60 * 1000;

function sanitizeOrderKey(orderId: string): string {
    return orderId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
}

function isPublicJpegBlobUrl(imageUrl: string): boolean {
    return (
        /public\.blob\.vercel-storage\.com/i.test(imageUrl) && /\.jpe?g(\?|$)/i.test(imageUrl)
    );
}

/**
 * Espone la foto come JPEG HTTPS pubblico raggiungibile da Meta.
 * Perché: Meta Cloud API non mostra WebP in modo affidabile e non legge Blob private.
 */
export async function ensureWhatsAppDeliveryImageUrl(
    orderId: string,
    imageUrl: string
): Promise<string> {
    if (isPublicJpegBlobUrl(imageUrl)) {
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

    const pathname = `${DELIVERY_STAGING_PREFIX}/${sanitizeOrderKey(orderId)}-${Date.now()}.jpg`;
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

/** Stessa pipeline JPEG+staging a partire da un buffer (chat operator / recovery). */
export async function ensureWhatsAppImageUrlFromBuffer(
    orderKey: string,
    buffer: Buffer
): Promise<string> {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.replace(/[^\x20-\x7E]/g, '').trim();
    if (!token) {
        throw new Error('BLOB_READ_WRITE_TOKEN mancante per staging WhatsApp.');
    }

    const jpegBytes = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();

    const pathname = `${DELIVERY_STAGING_PREFIX}/${sanitizeOrderKey(orderKey)}-${Date.now()}.jpg`;
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
