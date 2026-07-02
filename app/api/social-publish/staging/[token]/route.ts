import {
  fetchStagedImageBytes,
  verifySocialStagingToken,
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

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken) {
    return new Response('Server misconfigured', { status: 500 });
  }

  try {
    const { bytes, contentType } = await fetchStagedImageBytes(parsed.pathname, blobToken);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
