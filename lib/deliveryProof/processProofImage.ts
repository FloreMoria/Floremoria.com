import { put } from '@vercel/blob';
import sharp from 'sharp';

function slugify(text: string): string {
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

/** Data consegna in formato CEO: gg-mm-aaaa (es. 16-06-2026). */
function formatDeliveryDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
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
    deceasedName?: string | null;
    deceasedProfile?: { fullName?: string | null } | null;
};

/**
 * Ottimizza in WebP via Sharp (rotazione EXIF automatica) e carica su Vercel Blob.
 */
export async function processProofImageFile(
    file: File,
    _slot: 'before' | 'after',
    order: OrderMeta,
    _index: number
): Promise<string> {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const deceasedFullName =
        order.deceasedProfile?.fullName?.trim() || order.deceasedName?.trim() || 'defunto';
    const deceasedSlug = slugify(deceasedFullName) || 'defunto';
    const deliveryDate = formatDeliveryDate(new Date());
    const filename = `${deceasedSlug}-${deliveryDate}.webp`;

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
        addRandomSuffix: true,
    });

    return url;
}
