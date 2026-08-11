import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import { createPin, type CreatePinParams } from '@/lib/social/pinterest';

export const runtime = 'nodejs';

/**
 * POST /api/social/pinterest/publish
 * Endpoint di pubblicazione Pin su Pinterest API v5.
 * Payload:
 * {
 *   "board_id": "<board_id>",
 *   "title": "<title>",
 *   "description": "<description>",
 *   "link": "<link>",
 *   "media_source": {
 *     "source_type": "image_url",
 *     "url": "<URL_HTTPS_IMMAGINE_PUBLIC>"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value;
    if (!isDashboardAdminRole(role)) {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET?.trim();
        const isInternalAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;
        if (!isInternalAuth) {
            return NextResponse.json(
                { success: false, error: 'Non autorizzato. Solo staff dashboard o autenticazione interna.' },
                { status: 403 }
            );
        }
    }

    try {
        const body = (await request.json().catch(() => ({}))) as CreatePinParams;

        const title = body.title?.trim();
        const description = body.description?.trim();
        const imageUrl = (body.media_source?.url || body.imageUrl || body.image_url)?.trim();

        if (!title || !description || !imageUrl) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Parametri mancanti: title, description e imageUrl (o media_source.url) sono obbligatori.',
                },
                { status: 400 }
            );
        }

        const result = await createPin({
            board_id: body.board_id || body.boardId,
            title,
            description,
            link: body.link || 'https://www.floremoria.com',
            imageUrl,
            altText: body.altText || body.alt_text || title,
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error || 'Creazione Pin fallita.' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            simulated: result.simulated ?? false,
            pinId: result.pinId,
            data: result.data,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Pinterest Publish Route] Eccezione:', msg);
        return NextResponse.json(
            { success: false, error: msg },
            { status: 500 }
        );
    }
}
