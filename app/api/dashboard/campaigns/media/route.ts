import { NextResponse } from 'next/server';
import { getBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { blobPathnameFromUrl, isPrivateVercelBlobUrl } from '@/lib/dashboard/campaignMediaUrl';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return new NextResponse('URL mancante.', { status: 400 });
    }

    if (!isPrivateVercelBlobUrl(url)) {
      return new NextResponse('Solo blob privati Vercel sono serviti da questo proxy.', { status: 403 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
      return new NextResponse('Token di lettura Vercel Blob non configurato sul server.', { status: 500 });
    }

    const pathname = blobPathnameFromUrl(url);
    const blobResponse = await getBlobWithAccessFallback(pathname, { token, useCache: false });

    if (!blobResponse?.stream || blobResponse.statusCode !== 200) {
      console.error(
        `[Campaign Media Proxy] Blob non trovato o non leggibile (status=${blobResponse?.statusCode ?? 'n/a'}, pathname=${pathname})`
      );
      return new NextResponse('File non trovato nello store.', { status: 404 });
    }

    const headers = new Headers();
    const contentType = blobResponse.blob?.contentType || 'application/octet-stream';

    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(blobResponse.stream as BodyInit, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error('[Campaign Media Proxy] Errore nel caricamento del file privato:', err);
    return new NextResponse('Errore interno del server durante il caricamento del file.', { status: 500 });
  }
}
