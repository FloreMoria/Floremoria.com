import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { reReconcileBankStatementDocument } from '@/lib/financial/reconciliation';

type Ctx = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        const result = await reReconcileBankStatementDocument(id);
        return NextResponse.json({
            ok: true,
            message: `Ri-analisi completata: ${result.matched} nuovi match su ${result.updated} aggiornati · ${result.stillUnmatched} ancora da abbinare`,
            ...result,
        });
    } catch (error) {
        console.error('[bank-statements re-reconcile]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Ri-analisi fallita',
            },
            { status: 500 }
        );
    }
}
