import { put } from '@vercel/blob';
import { buildElegantProofFilename, slugifyProofName } from '@/lib/deliveryProof/proofFilenames';
import { normalizeProofImageBuffer } from '@/lib/deliveryProof/imagePipeline';
import { DELIVERY_PROOF_PRIVATE_PREFIX } from '@/lib/deliveryProof/storagePaths';

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
 * Ottimizza in WebP via Sharp (rotazione EXIF + strip orientamento) e carica su Vercel Blob.
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
    const filename = buildElegantProofFilename(deceasedFullName);

    let optimizedBuffer: Buffer;
    try {
        optimizedBuffer = await normalizeProofImageBuffer(buffer);
    } catch (err) {
        console.error('[processProofImage] Sharp conversion failed:', err);
        throw new Error('Impossibile elaborare una o più foto. Riprova con un formato immagine standard.');
    }

    const blobPath = `${DELIVERY_PROOF_PRIVATE_PREFIX}/${order.id}/${filename}`;
    const { url } = await put(blobPath, optimizedBuffer, {
        access: 'private',
        contentType: 'image/webp',
        token: getBlobToken(),
        addRandomSuffix: true,
    });

    return url;
}

export { slugifyProofName, buildElegantProofFilename };
