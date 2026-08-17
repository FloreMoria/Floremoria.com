import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Reinvio manuale conferma ordine cliente (template Meta a 3 variabili).
 * Body opzionale: { staffMessage?: string, force?: boolean }
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const body = (await request.json().catch(() => ({}))) as {
            staffMessage?: unknown;
            force?: unknown;
        };

        const staffMessage =
            typeof body.staffMessage === 'string' ? body.staffMessage : '';

        const result = await runPuntoBCustomerOrderConfirm(id, {
            force: body.force !== false,
            staffMessage,
        });

        if (!result.ok && !result.skipped) {
            return NextResponse.json(
                { success: false, error: result.error || 'Invio conferma fallito.', ...result },
                { status: 502 }
            );
        }

        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error('[dashboard/orders/customer-confirm]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
