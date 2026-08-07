/**
 * POST /api/dashboard/campaigns/generate-ziggy-reel
 * Genera Reel 8s con Ziggy × Google Veo per il modal «Nuovo post manuale».
 * Se Veo non è disponibile (chiave/permessi/quota): success soft con B-roll + copy.
 */
import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
  buildZiggyManualEditorialPack,
  generateZiggyManualReel,
} from '@/lib/marketing/reel/ziggyReelGenerator';
import {
  classifyVeoError,
  isVeoUnavailableKind,
} from '@/lib/media/veoClient';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const guard = await requireDashboardAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => ({}))) as {
    category?: string;
  };

  try {
    const result = await generateZiggyManualReel({
      category: body.category,
      requestId: `${Date.now()}`,
    });

    if (result.usedFallback) {
      console.warn(
        `[generate-ziggy-reel] fallback source=${result.videoSource} kind=${result.veoErrorKind ?? 'n/a'} video=${result.videoUrl ? 'yes' : 'manual-placeholder'}`
      );
    }

    return NextResponse.json({
      success: true,
      videoUrl: result.videoUrl,
      videoSource: result.videoSource,
      usedFallback: result.usedFallback,
      notice: result.notice,
      slogans: result.slogans,
      sloganTimeline: result.sloganTimeline,
      copy: result.copy,
      hashtags: result.hashtags,
      category: result.category,
      veoErrorKind: result.veoErrorKind ?? null,
      detail: result.veoDetail ?? null,
    });
  } catch (err) {
    const classified = classifyVeoError(err);
    // Chiave / auth / modello / quota → mai 5xx: pack copy + eventuale B-roll.
    if (isVeoUnavailableKind(classified.kind)) {
      const pack = buildZiggyManualEditorialPack(body.category);
      console.warn(
        `[generate-ziggy-reel] soft-fail kind=${classified.kind} → editorial pack detail=${classified.detail}`
      );
      return NextResponse.json({
        success: true,
        ...pack,
        usedFallback: true,
        veoErrorKind: classified.kind,
        detail: classified.detail,
      });
    }

    console.error(
      `[generate-ziggy-reel] kind=${classified.kind} http=${classified.httpStatus} detail=${classified.detail}`
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
