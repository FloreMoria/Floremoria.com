import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { buildSaasInvoicesZip } from '@/lib/financial/saasForeignInvoices';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/dashboard/finance/saas-invoices/download-zip?year=2026&month=8
 */
export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const year = Number(searchParams.get('year') || new Date().getFullYear());
        const month = Number(searchParams.get('month') || new Date().getMonth() + 1);
        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }
        if (!Number.isFinite(month) || month < 1 || month > 12) {
            return NextResponse.json({ ok: false, error: 'Mese non valido' }, { status: 400 });
        }

        const { zipBuffer, fileName } = await buildSaasInvoicesZip(year, month);
        return new NextResponse(new Uint8Array(zipBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        console.error('[saas-invoices download-zip]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Export ZIP fallito',
            },
            { status: 500 }
        );
    }
}
