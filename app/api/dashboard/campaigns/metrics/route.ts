import { NextResponse } from 'next/server';
import { MarketingChannel } from '@prisma/client';
import { syncAndListChannelMetrics } from '@/lib/marketing/socialMetrics/syncChannelMetrics';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CHANNELS = new Set<string>(Object.values(MarketingChannel));

/**
 * GET /api/dashboard/campaigns/metrics?channel=META_INSTAGRAM&refresh=1
 * Metriche vere (o best-effort) dei post PUBLISHED per il canale attivo.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = String(searchParams.get('channel') || '').trim();
    const refresh = searchParams.get('refresh') !== '0';

    if (!CHANNELS.has(channel)) {
      return NextResponse.json(
        { success: false, error: 'Parametro channel non valido.' },
        { status: 400 }
      );
    }

    const result = await syncAndListChannelMetrics(channel as MarketingChannel, {
      refresh,
      limit: 40,
    });

    return NextResponse.json({
      success: true,
      channel,
      refreshed: result.refreshed,
      summary: result.summary,
      rows: result.rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[campaigns/metrics]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
