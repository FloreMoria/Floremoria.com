import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { listActiveVeraAlerts } from '@/lib/vera/operationalAlerts';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const alerts = await listActiveVeraAlerts(100);
    return NextResponse.json({ success: true, alerts });
}
