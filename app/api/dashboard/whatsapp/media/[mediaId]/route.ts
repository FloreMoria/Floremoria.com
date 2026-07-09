import type { NextRequest } from 'next/server';
import {
    buildWhatsAppMediaResponse,
    fetchWhatsAppMediaFromMeta,
    requireWhatsAppMediaAccess,
} from '@/lib/whatsapp/proxyWhatsAppMedia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/dashboard/whatsapp/media/[mediaId] — proxy media Meta per staff ADMIN/SUPER_ADMIN. */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ mediaId: string }> }
): Promise<Response> {
    const auth = await requireWhatsAppMediaAccess();
    if (!auth.ok) {
        return new Response(auth.status === 401 ? 'Unauthorized' : 'Forbidden', { status: auth.status });
    }

    const { mediaId } = await context.params;
    if (!mediaId?.trim()) {
        return new Response('Missing mediaId', { status: 400 });
    }

    const download = request.nextUrl.searchParams.get('download') === '1';

    try {
        const { buffer, mimeType } = await fetchWhatsAppMediaFromMeta(mediaId.trim());
        return buildWhatsAppMediaResponse(buffer, mimeType, mediaId.trim(), download);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[wa-media-proxy] dashboard ${mediaId}:`, message);
        if (message.includes('metadata_fetch_failed') || message.includes('media_download_failed')) {
            return new Response('Failed to fetch media from Meta', { status: 502 });
        }
        if (message.includes('media_url_missing')) {
            return new Response('Media URL not found', { status: 404 });
        }
        if (message.includes('not configured')) {
            return new Response('Server misconfigured', { status: 500 });
        }
        return new Response('Internal Server Error', { status: 500 });
    }
}
