/**
 * Serve JPEG pubblici per Meta WhatsApp (token staging HMAC).
 * Usato da /api/chat/media/[id] e /api/whatsapp/delivery-staging/[token].
 */
import { getBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { fetchProofImageBuffer } from '@/lib/deliveryProof/blobProofStorage';
import {
    META_PUBLIC_IMAGE_HEADERS,
    stagingPathnameToBlobUrl,
    verifyMediaStagingToken,
} from '@/lib/whatsapp/mediaStagingShared';

export async function servePublicChatMediaFromToken(
    token: string,
    options?: { allowExpired?: boolean }
): Promise<Response> {
    const stagingToken = decodeURIComponent(token || '').trim();
    if (!stagingToken) {
        return new Response('Bad Request', { status: 400 });
    }

    const parsed = verifyMediaStagingToken(stagingToken, {
        allowExpired: options?.allowExpired,
    });
    if (!parsed) {
        return new Response('Forbidden or expired', { status: 403 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
        return new Response('Server misconfigured', { status: 500 });
    }

    try {
        // 1) SDK Blob (public/private fallback) — più affidabile del solo URL host.
        const blobResult = await getBlobWithAccessFallback(parsed.pathname, {
            token: process.env.BLOB_READ_WRITE_TOKEN.replace(/[^\x20-\x7E]/g, '').trim(),
            useCache: false,
        });
        if (blobResult?.stream && blobResult.statusCode === 200) {
            const bytes = Buffer.from(await new Response(blobResult.stream).arrayBuffer());
            return new Response(new Uint8Array(bytes), {
                status: 200,
                headers: META_PUBLIC_IMAGE_HEADERS,
            });
        }

        // 2) Fallback URL host (public o private in base a env).
        const blobUrl = stagingPathnameToBlobUrl(parsed.pathname);
        const bytes = await fetchProofImageBuffer(blobUrl);
        return new Response(new Uint8Array(bytes), {
            status: 200,
            headers: META_PUBLIC_IMAGE_HEADERS,
        });
    } catch (err) {
        console.error('[chat-media] serve failed:', parsed.pathname, err);
        return new Response('Not found', { status: 404 });
    }
}
