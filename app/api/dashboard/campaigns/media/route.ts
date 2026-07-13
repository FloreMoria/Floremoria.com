import { NextResponse } from 'next/server';
import { getBlobWithAccessFallback } from '@/lib/blob/storeAccess';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return new NextResponse('URL mancante.', { status: 400 });
    }

    // Per motivi di sicurezza, permetti il caricamento solo dallo store di Vercel Blob
    if (!url.includes('vercel-storage.com')) {
      return new NextResponse('Dominio non autorizzato.', { status: 403 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
      return new NextResponse('Token di lettura Vercel Blob non configurato sul server.', { status: 500 });
    }

    // Recupera lo stream del blob privato da Vercel
    const blobResponse = await getBlobWithAccessFallback(url, { token });

    if (!blobResponse || !blobResponse.stream) {
      return new NextResponse('File non trovato nello store.', { status: 404 });
    }

    const headers = new Headers();
    const contentType = blobResponse.blob?.contentType || 'application/octet-stream';
    
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable'); // Cache forte per i media immutabili

    return new Response(blobResponse.stream as any, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error('[Campaign Media Proxy] Errore nel caricamento del file privato:', err);
    return new NextResponse('Errore interno del server durante il caricamento del file.', { status: 500 });
  }
}
