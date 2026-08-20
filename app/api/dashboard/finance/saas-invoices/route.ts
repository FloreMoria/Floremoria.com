import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    listSaasForeignInvoices,
    sumSaasForeignEurCents,
} from '@/lib/financial/saasForeignInvoices';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    try {
        const { searchParams } = new URL(request.url);
        const periodKey = searchParams.get('periodKey') || undefined;
        const [invoices, totalEurCents] = await Promise.all([
            listSaasForeignInvoices(periodKey),
            sumSaasForeignEurCents(),
        ]);
        return NextResponse.json({ ok: true, invoices, totalEurCents });
    } catch (error) {
        console.error('[saas-invoices GET]', error);
        return NextResponse.json({ ok: false, error: 'Lettura fatture SaaS fallita' }, { status: 500 });
    }
}
