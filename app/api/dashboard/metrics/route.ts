import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getGlobalPartnerCommissionMetrics } from '@/lib/financial/partnerCommissionRegister';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Metriche aggregate partner/agenzia B2B — sempre calcolate live dal database.
 */
export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const testModeActive = await getDashboardTestModeActive();
        const partnerCommissions = await getGlobalPartnerCommissionMetrics(testModeActive);

        return NextResponse.json(
            {
                ok: true,
                generatedAt: new Date().toISOString(),
                partnerCommissions,
            },
            {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                },
            }
        );
    } catch (error) {
        console.error('[dashboard/metrics GET]', error);
        return NextResponse.json({ ok: false, error: 'Errore metriche dashboard.' }, { status: 500 });
    }
}
