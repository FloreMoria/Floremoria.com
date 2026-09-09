import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { runAllDossierControls } from '@/lib/financial/dossierFiscalControls';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';
import { parseFiscalPeriodParam } from '@/lib/financial/trimestreLabel';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/dashboard/finance/dossier-controls?year=2026&period=T2
 * Espone C1–C10 per il badge UI Contabilità (METODO §5).
 */
export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const year = Number(searchParams.get('year') || new Date().getFullYear());
        const period = parseFiscalPeriodParam(
            searchParams.get('period') ||
                searchParams.get('quarter') ||
                searchParams.get('trimestre')
        );
        const quarter = (period === 'YEAR' ? 1 : period) as TaxQuarter;

        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }

        const controls = await runAllDossierControls(year, quarter);
        const passed = controls.filter((c) => c.passed).length;

        return NextResponse.json({
            ok: true,
            year,
            quarter,
            periodLabel: period === 'YEAR' ? `Anno ${year}` : `T${quarter} ${year}`,
            passed,
            total: controls.length,
            allPassed: passed === controls.length,
            controls,
        });
    } catch (error) {
        console.error('[dossier-controls GET]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore controlli' },
            { status: 500 }
        );
    }
}
