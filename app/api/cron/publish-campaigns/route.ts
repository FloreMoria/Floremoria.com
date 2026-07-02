/**
 * GET /api/cron/publish-campaigns
 *
 * Trigger Vercel Cron giornaliero Futuria (05:00 UTC):
 * 1. Pipeline produzione — generateCampaignDraft → Imagen/Blob → checkpoint Guardiani
 * 2. Rilevamento campagne APPROVED pronte per pubblicazione (POSTMAN — step successivo)
 */
import { NextRequest, NextResponse } from 'next/server';
import { runFuturiaProductionPipeline } from '@/lib/futuria/engine/pipeline';
import { runFuturiaPublishPipeline } from '@/lib/futuria/engine/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';

  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.replace(/^Bearer\s+/i, '').trim() === secret) return true;

  const cronKey = request.headers.get('x-cron-key')?.trim();
  return cronKey === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    console.log('[Futuria Cron] publish-campaigns — trigger ricevuto');

    const production = await runFuturiaProductionPipeline();
    const publish = await runFuturiaPublishPipeline();

    return NextResponse.json(
      {
        success: true,
        message: 'Cron Futuria eseguito con successo',
        production,
        publish,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Errore nel cron job publish-campaigns:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
