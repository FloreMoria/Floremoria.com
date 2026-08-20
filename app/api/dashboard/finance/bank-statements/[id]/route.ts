import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    deleteBankStatement,
    getBankStatementDetail,
} from '@/lib/financial/bankStatements/store';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        const document = await getBankStatementDetail(id);
        if (!document) {
            return NextResponse.json({ ok: false, error: 'Documento non trovato' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, document });
    } catch (error) {
        console.error('[bank-statements GET id]', error);
        return NextResponse.json({ ok: false, error: 'Errore lettura documento' }, { status: 500 });
    }
}

export async function DELETE(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        const ok = await deleteBankStatement(id);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'Documento non trovato' }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[bank-statements DELETE]', error);
        return NextResponse.json({ ok: false, error: 'Eliminazione fallita' }, { status: 500 });
    }
}
