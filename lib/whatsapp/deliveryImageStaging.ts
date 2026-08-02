import { fetchProofImageBuffer } from '@/lib/deliveryProof/blobProofStorage';
import sharp from 'sharp';
import {
    createStagingToken,
    getSiteBaseUrl,
    stagingPathnameToBlobUrl,
} from '@/lib/whatsapp/mediaStagingShared';
import { preferDirectPublicJpegForMeta, stripUrlQueryAndFragment } from '@/lib/whatsapp/metaPublicImageUrl';

const DELIVERY_STAGING_PREFIX = 'whatsapp/delivery-staging';
const STAGING_TTL_MS = 60 * 60 * 1000;

function sanitizeOrderKey(orderId: string): string {
    return orderId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
}

async function toJpegBuffer(sourceBytes: Buffer): Promise<Buffer> {
    return sharp(sourceBytes, { failOn: 'none' })
        .rotate()
        .jpeg({ quality: 90, progressive: true, mozjpeg: true })
        .toBuffer();
}

/**
 * Carica JPEG su Blob e restituisce URL che Meta può scaricare:
 * - store public → URL Blob HTTPS JPEG senza query
 * - store private → /api/chat/media/{token} (proxy pubblico)
 */
async function stageJpegForMeta(orderKey: string, jpegBytes: Buffer): Promise<string> {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.replace(/[^\x20-\x7E]/g, '').trim();
    if (!token) {
        throw new Error('BLOB_READ_WRITE_TOKEN mancante per esporre foto a Meta.');
    }

    const pathname = `${DELIVERY_STAGING_PREFIX}/${sanitizeOrderKey(orderKey)}-${Date.now()}.jpg`;
    const { putBlobWithAccessFallback } = await import('@/lib/blob/storeAccess');
    const putResult = await putBlobWithAccessFallback(pathname, jpegBytes, {
        contentType: 'image/jpeg',
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
    });

    const direct = preferDirectPublicJpegForMeta(putResult.url);
    if (direct) {
        console.info('[whatsapp-staging] Meta URL diretto Blob pubblico JPEG');
        return direct;
    }

    const expiresAt = Date.now() + STAGING_TTL_MS;
    const stagingToken = createStagingToken(pathname, expiresAt);
    // Rotta dedicata chat media (header CORS + image/jpeg per Meta e smartphone).
    const publicProxy = `${getSiteBaseUrl()}/api/chat/media/${stagingToken}`;
    console.info('[whatsapp-staging] Meta URL proxy /api/chat/media');
    return publicProxy;
}

/**
 * Espone la foto come JPEG HTTPS pubblico raggiungibile da Meta.
 * Converte HEIC/WEBP/PNG → JPEG; rimuove query string.
 */
export async function ensureWhatsAppDeliveryImageUrl(
    orderId: string,
    imageUrl: string
): Promise<string> {
    const cleanSource = stripUrlQueryAndFragment(imageUrl);
    const alreadyPublicJpeg = preferDirectPublicJpegForMeta(cleanSource);
    if (alreadyPublicJpeg) {
        return alreadyPublicJpeg;
    }

    const sourceBytes = await fetchProofImageBuffer(cleanSource);
    const jpegBytes = await toJpegBuffer(sourceBytes);
    return stageJpegForMeta(orderId, jpegBytes);
}

/** Stessa pipeline JPEG+staging a partire da un buffer (chat operator / recovery). */
export async function ensureWhatsAppImageUrlFromBuffer(
    orderKey: string,
    buffer: Buffer
): Promise<string> {
    const jpegBytes = await toJpegBuffer(buffer);
    return stageJpegForMeta(orderKey, jpegBytes);
}

export { DELIVERY_STAGING_PREFIX, stagingPathnameToBlobUrl };
