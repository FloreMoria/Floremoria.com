import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { listGeneratedAutofatture } from '@/lib/financial/autofatturaHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const items = await listGeneratedAutofatture();
        return NextResponse.json({ ok: true, count: items.length, items });
    } catch (error) {
        console.error('[autofatture list]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Storico non disponibile' },
            { status: 500 }
        );
    }
}
