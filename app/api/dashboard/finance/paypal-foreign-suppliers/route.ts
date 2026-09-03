import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { listPaypalForeignSupplierPayments } from '@/lib/accounting/listPaypalForeignSupplierPayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const url = new URL(request.url);
        const year = Number(url.searchParams.get('year') || 2026);
        const period = url.searchParams.get('period');
        const report = await listPaypalForeignSupplierPayments({ year, period });
        return NextResponse.json({ ok: true, ...report });
    } catch (error) {
        console.error('[paypal-foreign-suppliers]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Elenco non disponibile',
            },
            { status: 500 }
        );
    }
}
