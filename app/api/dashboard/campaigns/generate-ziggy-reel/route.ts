/**
 * POST /api/dashboard/campaigns/generate-ziggy-reel
 * Genera Reel 8s con Ziggy × Google Veo per il modal «Nuovo post manuale».
 */
import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { generateZiggyManualReel } from '@/lib/marketing/reel/ziggyReelGenerator';
import {
  MISSING_VEO_API_KEY_MESSAGE,
  classifyVeoError,
  resolveGeminiVeoApiKey,
} from '@/lib/media/veoClient';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const guard = await requireDashboardAdmin();
  if (!guard.ok) return guard.response;

  if (!resolveGeminiVeoApiKey()) {
    console.error('[generate-ziggy-reel] kind=missing_api_key');
    return NextResponse.json(
      {
        success: false,
        error: MISSING_VEO_API_KEY_MESSAGE,
        errorKind: 'missing_api_key' as const,
      },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      category?: string;
    };
    const result = await generateZiggyManualReel({
      category: body.category,
      requestId: `${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      videoUrl: result.videoUrl,
      slogans: result.slogans,
      sloganTimeline: result.sloganTimeline,
      copy: result.copy,
      hashtags: result.hashtags,
      category: result.category,
    });
  } catch (err) {
    const classified = classifyVeoError(err);
    console.error(
      `[generate-ziggy-reel] kind=${classified.kind} http=${classified.httpStatus} upstream=${classified.upstreamStatus ?? 'n/a'} detail=${classified.detail}`
    );
    return NextResponse.json(
      {
        success: false,
        error: classified.error,
        errorKind: classified.kind,
        detail: classified.detail,
        upstreamStatus: classified.upstreamStatus ?? null,
      },
      { status: classified.httpStatus }
    );
  }
}
