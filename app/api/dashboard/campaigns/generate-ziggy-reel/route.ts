/**
 * POST /api/dashboard/campaigns/generate-ziggy-reel
 * Reel Ziggy: Veo → Pexels Video 4K portrait → env B-roll.
 * Garantisce success con videoUrl MP4 (quando Pexels/env disponibili) + copy/hashtag/slogan.
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

function toResponsePayload(result: Awaited<ReturnType<typeof generateZiggyManualReel>>) {
  return {
    success: true as const,
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
  };
}

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

    if (!result.videoUrl) {
      console.error(
        '[generate-ziggy-reel] videoUrl assente — configura PEXELS_API_KEY su Vercel'
      );
    } else if (result.usedFallback) {
      console.warn(
        `[generate-ziggy-reel] source=${result.videoSource} kind=${result.veoErrorKind ?? 'n/a'}`
      );
    }

    return NextResponse.json(toResponsePayload(result));
  } catch (err) {
    const classified = classifyVeoError(err);
    if (isVeoUnavailableKind(classified.kind)) {
      const pack = await buildZiggyManualEditorialPack(
        body.category,
        `soft-${Date.now()}`
      );
      console.warn(
        `[generate-ziggy-reel] soft-fail kind=${classified.kind} → stock source=${pack.videoSource}`
      );
      return NextResponse.json({
        ...toResponsePayload(pack),
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
