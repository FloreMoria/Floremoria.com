import {
  fetchStagedImageBytes,
  verifySocialStagingToken,
} from '@/lib/postman/socialImageStaging';

export const runtime = 'nodejs';

function contentTypeFromStagingPath(pathname: string): string {
  const lower = pathname.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/webp';
}

/**
 * Endpoint pubblico temporaneo per Meta/Instagram/TikTok: serve media da Blob privato
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
        'Content-Type': contentType || contentTypeFromStagingPath(parsed.pathname),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('[social-publish/staging] fetch failed:', parsed.pathname, err);
    return new Response('Not found', { status: 404 });
  }
}
