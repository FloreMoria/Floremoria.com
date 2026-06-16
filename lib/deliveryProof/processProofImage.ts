import { put } from '@vercel/blob';
import sharp from 'sharp';

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function getBlobToken(): string {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
        throw new Error(
            '[delivery-proof] BLOB_READ_WRITE_TOKEN mancante. Crea uno store Blob su Vercel e aggiungi il token in .env.local.'
        );
    }
    return token;
}

type OrderMeta = {
    id: string;
    orderNumber?: string | null;
    cemeteryCity?: string | null;
    deliveryProvince?: string | null;
    items?: Array<{ product?: { name?: string | null } | null }>;
};

/**
 * Ottimizza in WebP via Sharp (rotazione EXIF automatica) e carica su Vercel Blob.
 */
export async function processProofImageFile(
    file: File,
    slot: 'before' | 'after',
    order: OrderMeta,
    index: number
): Promise<string> {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const serviceName = order.items?.[0]?.product?.name || 'consegna-floreale';
    const city = order.cemeteryCity || 'citta';
    const province = order.deliveryProvince || 'prov';
    const orderNum = order.orderNumber || order.id.substring(0, 8);
    const seoSlug = slugify(`${serviceName}-${city}-${province}-${orderNum}`);
    const filename = `${seoSlug}-${slot}-${index + 1}.webp`;

    let optimizedBuffer: Buffer;
    try {
        optimizedBuffer = await sharp(buffer, { failOn: 'none' })
            .rotate()
            .webp({ quality: 80 })
            .toBuffer();
    } catch (err) {
        console.error('[processProofImage] Sharp conversion failed:', err);
        throw new Error('Impossibile elaborare una o più foto. Riprova con un formato immagine standard.');
    }

    const blobPath = `delivery-proof/${order.id}/${filename}`;
    const { url } = await put(blobPath, optimizedBuffer, {
        access: 'public',
        contentType: 'image/webp',
        token: getBlobToken(),
        addRandomSuffix: false,
    });

    return url;
}
