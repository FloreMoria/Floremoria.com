import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    deleteSaasForeignInvoice,
    getSaasInvoiceFile,
} from '@/lib/financial/saasForeignInvoices';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

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

export async function DELETE(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    try {
        const ok = await deleteSaasForeignInvoice(id);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'Fattura non trovata' }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[saas-invoices DELETE]', error);
        return NextResponse.json({ ok: false, error: 'Eliminazione fallita' }, { status: 500 });
    }
}
