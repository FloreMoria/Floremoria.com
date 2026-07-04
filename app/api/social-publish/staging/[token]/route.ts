import {
  verifySocialStagingToken,
  stagingPathnameToBlobUrl,
} from '@/lib/postman/socialImageStaging';

export const runtime = 'nodejs';

/**
 * Endpoint pubblico temporaneo per Meta/Instagram: serve immagini da Blob privato
 * tramite token HMAC (scadenza ~20 min). Nessun dato ordine nel path.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token: stagingToken } = await context.params;
  const parsed = verifySocialStagingToken(stagingToken);
  if (!parsed) {
    return new Response('Forbidden or expired', { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return new Response('Server misconfigured', { status: 500 });
  }

  try {
    const blobUrl = stagingPathnameToBlobUrl(parsed.pathname);
    const { fetchProofImageBuffer } = await import('@/lib/deliveryProof/blobProofStorage');
    const bytes = await fetchProofImageBuffer(blobUrl);
    const contentType = parsed.pathname.toLowerCase().endsWith('.jpg')
      ? 'image/jpeg'
      : parsed.pathname.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/webp';
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('[social-publish/staging] fetch failed:', parsed.pathname, err);
    return new Response('Not found', { status: 404 });
  }
}
