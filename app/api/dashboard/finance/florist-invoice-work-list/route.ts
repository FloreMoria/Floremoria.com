import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { buildFloristInvoiceWorkList } from '@/lib/financial/floristInvoiceWorkList';

export const dynamic = 'force-dynamic';

/** Lista di lavoro (non controllo C*): fatture fiorista da sollecitare. */
export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const data = await buildFloristInvoiceWorkList();
        return NextResponse.json({ ok: true, data });
    } catch (e) {
        console.error('[florist-invoice-work-list]', e);
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : 'Errore' },
            { status: 500 }
        );
    }
}
