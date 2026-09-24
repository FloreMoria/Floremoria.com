import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    archiveBankStatement,
    getBankStatementDetail,
} from '@/lib/financial/bankStatements/store';

type Ctx = { params: Promise<{ id: string }> };

const ARCHIVE_CONFIRM = 'ARCHIVIA';

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

/**
 * Soft-archive (non cancella blob né linee).
 * Body obbligatorio: { "confirm": "ARCHIVIA" }
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        let confirm = '';
        try {
            const body = (await request.json()) as { confirm?: string };
            confirm = typeof body?.confirm === 'string' ? body.confirm.trim() : '';
        } catch {
            confirm = '';
        }
        if (confirm !== ARCHIVE_CONFIRM) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `Conferma obbligatoria: digita ${ARCHIVE_CONFIRM} per archiviare (nessuna cancellazione).`,
                },
                { status: 400 }
            );
        }

        const ok = await archiveBankStatement(id);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'Documento non trovato' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, archived: true });
    } catch (error) {
        console.error('[bank-statements ARCHIVE]', error);
        return NextResponse.json({ ok: false, error: 'Archiviazione fallita' }, { status: 500 });
    }
}
