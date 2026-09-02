import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { runAiVisibilityAudit } from '@/lib/seo/aiAuditRunner';
import { saveAiAuditSnapshot } from '@/lib/seo/aiAuditSnapshotStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const summary = await runAiVisibilityAudit();
        const snapshot = await saveAiAuditSnapshot(summary);
        return NextResponse.json({ ok: true, snapshot });
    } catch (error) {
        console.error('[audit/ai-visibility/run]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Esecuzione audit fallita',
            },
            { status: 500 }
        );
    }
}
