/**
 * GET /api/cron/publish-campaigns-dispatch
 *
 * Secondo trigger giornaliero (09:00 Europe/Rome): sync media multicanale + pubblicazione POSTMAN
 * per recuperare campagne approvate dopo il cron produzione delle 07:00.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runMarketingPublishPipeline } from '@/lib/marketing/engine/publish';

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
    console.log('[Marketing Cron] publish-campaigns-dispatch — sync + publish');
    const publish = await runMarketingPublishPipeline();

    return NextResponse.json(
      {
        success: true,
        message: 'Dispatch marketing multicanale completato',
        publish,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Errore nel cron publish-campaigns-dispatch:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
