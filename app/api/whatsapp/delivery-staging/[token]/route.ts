import { NextResponse } from 'next/server';
import { fetchProofImageBuffer } from '@/lib/deliveryProof/blobProofStorage';
import { stagingPathnameToBlobUrl, verifyMediaStagingToken } from '@/lib/whatsapp/mediaStagingShared';

export const runtime = 'nodejs';

/** Serve foto consegna da Blob privato tramite token HMAC temporaneo (Meta Cloud API). */
export async function GET(
    _request: Request,
    context: { params: Promise<{ token: string }> }
): Promise<Response> {
    const { token: stagingToken } = await context.params;
    const parsed = verifyMediaStagingToken(stagingToken);
    if (!parsed) {
        return new Response('Forbidden or expired', { status: 403 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
        return new Response('Server misconfigured', { status: 500 });
    }

    try {
        const blobUrl = stagingPathnameToBlobUrl(parsed.pathname);
        const bytes = await fetchProofImageBuffer(blobUrl);
        return new Response(new Uint8Array(bytes), {
            status: 200,
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'private, max-age=300',
            },
        });
    } catch (err) {
        console.error('[whatsapp/delivery-staging] fetch failed:', parsed.pathname, err);
        return new Response('Not found', { status: 404 });
    }
}
