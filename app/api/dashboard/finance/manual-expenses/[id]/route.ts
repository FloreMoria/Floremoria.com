import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { deleteManualExpense } from '@/lib/financial/manualExpenses';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    try {
        const ok = await deleteManualExpense(id);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'Spesa non trovata' }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[manual-expenses DELETE]', error);
        return NextResponse.json({ ok: false, error: 'Eliminazione fallita' }, { status: 500 });
    }
}
