/**
 * Upload immagini profilo (avatar utente / foto defunto) su Vercel Blob.
 * Prefisso bucket logico: floremoria-media/ (equivalente al bucket Supabase richiesto in spec).
 */
import { put } from '@vercel/blob';
import { getBlobStoreAccess } from '@/lib/blob/storeAccess';
import { normalizeProofImageBuffer } from '@/lib/deliveryProof/imagePipeline';

const MEDIA_PREFIX = 'floremoria-media';

function getBlobToken(): string {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
        throw new Error(
            '[media-upload] BLOB_READ_WRITE_TOKEN mancante. Configura Vercel Blob (stesso store delle prove di consegna).'
        );
    }
    return token;
}

export type MediaEntityKind = 'user' | 'deceased';

export async function uploadProfileImage(
    file: File,
    kind: MediaEntityKind,
    entityId: string
): Promise<string> {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let optimized: Buffer;
    try {
        optimized = await normalizeProofImageBuffer(buffer);
    } catch (err) {
        console.error('[media-upload] Sharp failed:', err);
        throw new Error('Impossibile elaborare l\'immagine. Usa JPG, PNG o HEIC.');
    }

    const folder = kind === 'user' ? 'users' : 'deceased';
    const blobPath = `${MEDIA_PREFIX}/${folder}/${entityId}/portrait.webp`;

    const { url } = await put(blobPath, optimized, {
        access: getBlobStoreAccess(),
        contentType: 'image/webp',
        token: getBlobToken(),
        addRandomSuffix: true,
    });

    return url;
}
