/**
 * GET /api/download?url=&filename=
 * Proxy di download universale per foto e allegati multimediali.
 * Garantisce l'invio degli header Content-Disposition: attachment per evitare blocchi CORS.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getFilenameFromUrl(urlStr: string, customName?: string | null): string {
    if (customName && customName.trim()) {
        const clean = customName.trim().replace(/[/\\?%*:|"<>]/g, '_');
        return clean;
    }
    try {
        const parsed = new URL(urlStr);
        const pathname = parsed.pathname;
        const basename = pathname.split('/').pop();
        if (basename && basename.includes('.')) {
            return basename.replace(/[/\\?%*:|"<>]/g, '_');
        }
    } catch {
        /* fallback sotto */
    }
    return `floremoria-media-${Date.now()}.jpg`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const rawUrl = request.nextUrl.searchParams.get('url')?.trim();
    const customFilename = request.nextUrl.searchParams.get('filename')?.trim();

    if (!rawUrl) {
        return NextResponse.json({ ok: false, error: 'Parametro url mancante.' }, { status: 400 });
    }

    try {
        // Gestisci sia URL assoluti (http/https) che percorsi relativi
        let targetUrl = rawUrl;
        if (rawUrl.startsWith('/')) {
            const origin = request.nextUrl.origin;
            targetUrl = `${origin}${rawUrl}`;
        } else if (!/^https?:\/\//i.test(rawUrl)) {
            return NextResponse.json({ ok: false, error: 'URL non valido.' }, { status: 400 });
        }

        const upstream = await fetch(targetUrl, {
            cache: 'no-store',
            headers: {
                'User-Agent': 'FloreMoria-DownloadProxy/1.0',
            },
        });

        if (!upstream.ok) {
            console.error('[api/download] Upstream failed:', upstream.status, targetUrl.slice(0, 90));
            return NextResponse.json(
                { ok: false, error: `Impossibile scaricare la risorsa (HTTP ${upstream.status}).` },
                { status: 502 }
            );
        }

        const contentType = upstream.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await upstream.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const filename = getFilenameFromUrl(rawUrl, customFilename);

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
        console.error('[api/download] Error:', err);
        return NextResponse.json({ ok: false, error: 'Errore durante il download del file.' }, { status: 500 });
    }
}
