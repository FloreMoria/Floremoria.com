import type { NextRequest } from 'next/server';
import { fetchProofImageBuffer } from '@/lib/deliveryProof/blobProofStorage';
import {
    stagingPathnameToBlobUrl,
    verifyMediaStagingToken,
} from '@/lib/whatsapp/mediaStagingShared';
import { requireWhatsAppMediaAccess } from '@/lib/whatsapp/proxyWhatsAppMedia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/whatsapp/delivery-staging/[token]
 * Proxy staff: serve foto staging anche dopo scadenza token Meta (HMAC ancora valido).
 */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ token: string }> }
): Promise<Response> {
    const auth = await requireWhatsAppMediaAccess();
    if (!auth.ok) {
        return new Response(auth.status === 401 ? 'Unauthorized' : 'Forbidden', { status: auth.status });
    }

    const { token: stagingToken } = await context.params;
    const parsed = verifyMediaStagingToken(stagingToken, { allowExpired: true });
    if (!parsed) {
        return new Response('Forbidden or invalid token', { status: 403 });
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
                'Cache-Control': 'private, max-age=86400',
                'Access-Control-Allow-Origin': '*',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (err) {
        console.error('[dashboard/delivery-staging] fetch failed:', parsed.pathname, err);
        return new Response('Not found', { status: 404 });
    }
}
