import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    archiveSaasForeignInvoice,
    getSaasInvoiceFile,
} from '@/lib/financial/saasForeignInvoices';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const ARCHIVE_CONFIRM = 'ARCHIVIA';

export async function GET(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    try {
        const file = await getSaasInvoiceFile(id);
        if (!file) {
            return NextResponse.json({ ok: false, error: 'Fattura non trovata' }, { status: 404 });
        }
        return new NextResponse(new Uint8Array(file.bytes), {
            status: 200,
            headers: {
                'Content-Type': file.row.contentType || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${file.row.fileName.replace(/"/g, '')}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        console.error('[saas-invoices GET id]', error);
        return NextResponse.json({ ok: false, error: 'Download fallito' }, { status: 500 });
    }
}

/**
 * Soft-archive (non cancella blob né riga).
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

        const ok = await archiveSaasForeignInvoice(id);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'Fattura non trovata' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, archived: true });
    } catch (error) {
        console.error('[saas-invoices ARCHIVE]', error);
        return NextResponse.json({ ok: false, error: 'Archiviazione fallita' }, { status: 500 });
    }
}
