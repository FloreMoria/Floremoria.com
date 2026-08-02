/**
 * GET /api/delivery-proof/download?orderId=&url=
 * Proxy download HD foto di posa per Utente (proprietario) e Admin.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authorizeProofPhotoDownload } from '@/lib/deliveryProof/authorizeProofPhotoDownload';
import { downloadFilenameFromProofUrl } from '@/lib/deliveryProof/proofFilenames';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
    const orderId = request.nextUrl.searchParams.get('orderId')?.trim() || '';
    const url = request.nextUrl.searchParams.get('url')?.trim() || '';

    const auth = await authorizeProofPhotoDownload({ orderId, photoUrl: url });
    if (!auth.ok) {
        return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    try {
        const upstream = await fetch(auth.allowedUrl, { cache: 'no-store' });
        if (!upstream.ok) {
            console.error('[proof-download] Upstream failed', upstream.status, auth.allowedUrl.slice(0, 80));
            return NextResponse.json(
                { ok: false, error: 'Impossibile recuperare la foto.' },
                { status: 502 }
            );
        }

        const contentType = upstream.headers.get('content-type') || 'image/jpeg';
        const buffer = Buffer.from(await upstream.arrayBuffer());
        const filename = downloadFilenameFromProofUrl(auth.allowedUrl, auth.deceasedName);

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(buffer.length),
                'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (err) {
        console.error('[proof-download]', err);
        return NextResponse.json({ ok: false, error: 'Errore download.' }, { status: 500 });
    }
}
