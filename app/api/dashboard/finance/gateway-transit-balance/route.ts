import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { compareGatewayTransitBalances } from '@/lib/financial/gatewayTransitBalance';
import { isPayoutIdClassificationEnabled } from '@/lib/financial/chartOfAccounts';

export const dynamic = 'force-dynamic';

/** Debug: saldo conti di transito vs gateway reale (Fase 2 baseline). */
export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const comparison = await compareGatewayTransitBalances();
        return NextResponse.json({
            ok: true,
            payoutIdClassificationEnabled: isPayoutIdClassificationEnabled(),
            comparison,
        });
    } catch (error) {
        console.error('[gateway-transit-balance]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore' },
            { status: 500 }
        );
    }
}
