/**
 * GET /api/chat/media/[id]
 * Erogazione pubblica JPEG per anteprima WhatsApp (Meta) e dispositivi utente.
 * `id` = token HMAC staging (stesso formato di /api/whatsapp/delivery-staging).
 */
import type { NextRequest } from 'next/server';
import { servePublicChatMediaFromToken } from '@/lib/whatsapp/servePublicChatMedia';
import { META_PUBLIC_IMAGE_HEADERS } from '@/lib/whatsapp/mediaStagingShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(): Promise<Response> {
    return new Response(null, { status: 204, headers: META_PUBLIC_IMAGE_HEADERS });
}

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<Response> {
    const { id } = await context.params;
    return servePublicChatMediaFromToken(id);
}
