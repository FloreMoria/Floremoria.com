import { NextRequest } from 'next/server';
import { getSessionRoleName } from '@/lib/superAdminAuth';
import { isDashboardAdminRole } from '@/lib/superAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ mediaId: string }> }
): Promise<Response> {
    // 1. Authenticate check: only Dashboard Admin (ADMIN or SUPER_ADMIN)
    const role = await getSessionRoleName();
    if (!isDashboardAdminRole(role)) {
        return new Response('Unauthorized', { status: 403 });
    }

    const { mediaId } = await context.params;
    if (!mediaId) {
        return new Response('Missing mediaId', { status: 400 });
    }

    const apiKey = process.env.WHATSAPP_CLOUD_API_KEY?.trim();
    if (!apiKey) {
        return new Response('WhatsApp API Key not configured', { status: 500 });
    }

    try {
        // Step A: Get Meta Media metadata to retrieve the download URL
        const metaUrl = `https://graph.facebook.com/v19.0/${mediaId}`;
        const metaRes = await fetch(metaUrl, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });

        if (!metaRes.ok) {
            console.error(`[wa-media-proxy] Meta API metadata fetch failed for ${mediaId}:`, metaRes.status);
            return new Response('Failed to fetch media metadata', { status: 502 });
        }

        const metadata = await metaRes.json();
        const downloadUrl = metadata.url;
        if (!downloadUrl) {
            return new Response('Media URL not found in metadata', { status: 404 });
        }

        // Step B: Download media content from the lookaside URL using the same bearer token
        const mediaRes = await fetch(downloadUrl, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });

        if (!mediaRes.ok) {
            console.error(`[wa-media-proxy] Meta media download failed for ${mediaId}:`, mediaRes.status);
            return new Response('Failed to download media content', { status: 502 });
        }

        const mimeType = mediaRes.headers.get('content-type') || 'application/octet-stream';
        const buffer = await mediaRes.arrayBuffer();

        return new Response(buffer, {
            headers: {
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (e) {
        console.error(`[wa-media-proxy] Exception proxying media ${mediaId}:`, e);
        return new Response('Internal Server Error', { status: 500 });
    }
}
