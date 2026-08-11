import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Max video campagna (TikTok / Reel): 200 MB — upload diretto client → Blob, non passa dal body Next. */
const MAX_CAMPAIGN_MEDIA_BYTES = 200 * 1024 * 1024;

/**
 * Token client per upload media campagne (video TikTok/Reel) senza superare i limiti body Vercel/Next.
 * Il browser carica su Blob; la route /upload riceve solo l'URL pubblico.
 */
export async function POST(request: Request) {
  const auth = await requireDashboardAdmin();
  if (!auth.ok) return auth.response;

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json(
      { error: 'Body JSON non valido per blob-upload.' },
      { status: 400 }
    );
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN?.trim(),
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('marketing/campagne/')) {
          throw new Error('Pathname upload non consentito.');
        }
        return {
          allowedContentTypes: [
            'video/mp4',
            'video/quicktime',
            'video/webm',
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/*',
            'video/*',
          ],
          maximumSizeInBytes: MAX_CAMPAIGN_MEDIA_BYTES,
          addRandomSuffix: true,
          allowOverwrite: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload token non riuscito.';
    console.error('[campaigns/blob-upload]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
