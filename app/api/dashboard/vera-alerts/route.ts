import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    clearVeraOperationalAlert,
    listActiveVeraAlerts,
} from '@/lib/vera/operationalAlerts';
import prisma from '@/lib/prisma';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const alerts = await listActiveVeraAlerts(100);
    return NextResponse.json({ success: true, alerts });
}

/**
 * PATCH { orderId } — staff marca la segnalazione VERA come risolta (chiude l’avviso).
 */
export async function PATCH(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
        const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
        if (!orderId) {
            return NextResponse.json(
                { success: false, error: 'orderId obbligatorio.' },
                { status: 400 }
            );
        }

        const order = await prisma.order.findFirst({
            where: { id: orderId, deletedAt: null },
            select: { id: true, veraAlertType: true },
        });
        if (!order) {
            return NextResponse.json(
                { success: false, error: 'Ordine non trovato.' },
                { status: 404 }
            );
        }
        if (!order.veraAlertType) {
            return NextResponse.json({ success: true, alreadyResolved: true, orderId });
        }

        await clearVeraOperationalAlert(orderId);
        console.log(`[vera-alerts] Segnalazione risolta da staff su ordine ${orderId}`);
        return NextResponse.json({ success: true, orderId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[vera-alerts] PATCH', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
