import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { deleteGeneratedAutofattura } from '@/lib/financial/autofatturaHistory';

type Ctx = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        await deleteGeneratedAutofattura(id);
        return NextResponse.json({ ok: true, deletedId: id });
    } catch (error) {
        console.error('[autofatture delete]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Eliminazione non riuscita',
            },
            { status: 400 }
        );
    }
}
