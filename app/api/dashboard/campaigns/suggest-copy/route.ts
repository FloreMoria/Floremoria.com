import { NextResponse } from 'next/server';
import { suggestManualPostCopy } from '@/lib/marketing/suggestManualPostCopy';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST multipart: file + channel + contentFormat → copy/hashtags per il canale.
 * Per i video il client può inviare un fotogramma JPEG (campo isVideoFrame=1).
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const channel = String(formData.get('channel') || '').trim();
    const contentFormat = String(formData.get('contentFormat') || 'FEED_POST').trim();
    const isVideoFrame = String(formData.get('isVideoFrame') || '') === '1';

    if (!file || !channel) {
      return NextResponse.json(
        { success: false, error: 'file e channel sono obbligatori.' },
        { status: 400 }
      );
    }

    const mimeType = file.type || 'image/jpeg';
    if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
      return NextResponse.json(
        { success: false, error: 'Solo immagini o video sono supportati.' },
        { status: 400 }
      );
    }

    // Video grezzi troppo pesanti per inline: chiediamo un frame lato client.
    if (mimeType.startsWith('video/') && !isVideoFrame) {
      return NextResponse.json(
        {
          success: false,
          error: 'Per i video inviare un fotogramma (isVideoFrame=1) estratto dal client.',
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > 8 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Media troppo grande per l’analisi (max 8MB).' },
        { status: 400 }
      );
    }

    const suggestion = await suggestManualPostCopy({
      channel,
      contentFormat,
      mediaBuffer: buffer,
      mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
      fileName: file.name,
      isVideoFrame: isVideoFrame || mimeType.startsWith('video/'),
    });

    return NextResponse.json({
      success: true,
      copy: suggestion.copy,
      hashtags: suggestion.hashtags,
      category: suggestion.category,
      source: suggestion.source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[suggest-copy]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
