import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { buildAiVisibilityReportPayload } from '@/lib/seo/aiVisibilityBenchmark';
import { getLatestAiAuditSnapshot } from '@/lib/seo/aiAuditSnapshotStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const report = buildAiVisibilityReportPayload();
        let snapshot = null;
        try {
            snapshot = await getLatestAiAuditSnapshot();
        } catch (dbError) {
            console.warn('[audit/ai-visibility] snapshot DB non disponibile:', dbError);
        }
        return NextResponse.json({ ok: true, report, snapshot });
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
