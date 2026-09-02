import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { buildAiVisibilityReportPayload } from '@/lib/seo/aiVisibilityBenchmark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const report = buildAiVisibilityReportPayload();
        return NextResponse.json({ ok: true, report });
    } catch (error) {
        console.error('[audit/ai-visibility]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Report non disponibile',
            },
            { status: 500 }
        );
    }
}
