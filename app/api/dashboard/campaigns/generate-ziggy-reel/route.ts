/**
 * POST /api/dashboard/campaigns/generate-ziggy-reel
 * Genera Reel 8s con Ziggy × Google Veo per il modal «Nuovo post manuale».
 */
import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { generateZiggyManualReel } from '@/lib/marketing/reel/ziggyReelGenerator';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const guard = await requireDashboardAdmin();
  if (!guard.ok) return guard.response;

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
    const message = err instanceof Error ? err.message : 'Errore generazione Reel Ziggy.';
    console.error('[generate-ziggy-reel]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
