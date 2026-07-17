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
        console.error(`[wa-media-proxy] Fallback to placeholder for mediaId ${mediaId}:`, message);

        const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none">
  <rect width="120" height="120" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
  <circle cx="60" cy="50" r="16" fill="#CBD5E1"/>
  <path d="M60 44V56M54 50H66" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
  <text x="60" y="88" fill="#64748B" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="700" text-anchor="middle" letter-spacing="0.5">MEDIA NON</text>
  <text x="60" y="100" fill="#64748B" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="700" text-anchor="middle" letter-spacing="0.5">DISPONIBILE</text>
</svg>`;

        return new Response(PLACEHOLDER_SVG, {
            status: 404,
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'no-store, must-revalidate',
            },
        });
    }
}
