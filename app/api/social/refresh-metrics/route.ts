import { NextResponse } from 'next/server';
import { MarketingChannel } from '@prisma/client';
import { syncAndListChannelMetrics } from '@/lib/marketing/socialMetrics/syncChannelMetrics';
import type { CampaignMetricsRow } from '@/lib/marketing/socialMetrics/types';
import { getSocialInsightsConnection } from '@/lib/marketing/socialMetrics/connectionStatus';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const VALID_CHANNELS = new Set<string>(Object.values(MarketingChannel));

async function handleRefresh(request: Request) {
  try {
    const url = new URL(request.url);
    let channelParam = url.searchParams.get('channel')?.trim() || '';
    const refreshParam = url.searchParams.get('refresh');
    let refresh = refreshParam !== '0';

    if (request.method === 'POST') {
      try {
        const body = (await request.json().catch(() => ({}))) as {
          channel?: string;
          refresh?: boolean;
        };
        if (body?.channel) {
          channelParam = String(body.channel).trim();
        }
        if (typeof body?.refresh === 'boolean') {
          refresh = body.refresh;
        }
      } catch {
        // Usa fallback da searchParams
      }
    }

    if (channelParam && channelParam.toUpperCase() !== 'ALL' && VALID_CHANNELS.has(channelParam)) {
      const result = await syncAndListChannelMetrics(channelParam as MarketingChannel, {
        refresh,
        limit: 50,
      });

      return NextResponse.json({
        success: true,
        channel: channelParam,
        refreshed: result.refreshed,
        summary: result.summary,
        rows: result.rows,
        connection: result.connection,
        lastSyncedAt: result.lastSyncedAt,
      });
    }

    const channelsToSync: MarketingChannel[] = [
      MarketingChannel.META_INSTAGRAM,
      MarketingChannel.META_FACEBOOK,
      MarketingChannel.TIKTOK,
      MarketingChannel.LINKEDIN,
      MarketingChannel.PINTEREST,
    ];

    let allRows: CampaignMetricsRow[] = [];
    const summaryAgg = {
      posts: 0,
      withLiveMetrics: 0,
      views: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      engagement: 0,
    };
    const connectionWarnings: string[] = [];
    let lastSyncedAt: string | null = null;

    for (const ch of channelsToSync) {
      try {
        const res = await syncAndListChannelMetrics(ch, { refresh, limit: 50 });
        allRows = allRows.concat(res.rows);
        summaryAgg.posts += res.summary.posts;
        summaryAgg.withLiveMetrics += res.summary.withLiveMetrics;
        summaryAgg.views += res.summary.views;
        summaryAgg.reach += res.summary.reach;
        summaryAgg.likes += res.summary.likes;
        summaryAgg.comments += res.summary.comments;
        summaryAgg.engagement += res.summary.engagement;
        if (!res.connection.ok) connectionWarnings.push(res.connection.message);
        if (res.lastSyncedAt && (!lastSyncedAt || res.lastSyncedAt > lastSyncedAt)) {
          lastSyncedAt = res.lastSyncedAt;
        }
      } catch (err) {
        console.error(`[refresh-metrics] sync error for ${ch}:`, err);
        const conn = getSocialInsightsConnection(ch);
        if (!conn.ok) connectionWarnings.push(conn.message);
      }
    }

    return NextResponse.json({
      success: true,
      channel: 'ALL',
      refreshed: refresh,
      summary: summaryAgg,
      rows: allRows,
      connection: {
        ok: connectionWarnings.length === 0,
        message:
          connectionWarnings[0] ||
          'Insight multi-canale aggiornati (solo dati reali o zero).',
      },
      lastSyncedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[social/refresh-metrics]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleRefresh(request);
}

export async function POST(request: Request) {
  return handleRefresh(request);
}
