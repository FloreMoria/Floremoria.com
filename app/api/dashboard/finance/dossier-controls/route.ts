import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { runAndPersistDossierControls } from '@/lib/financial/dossierFiscalControls';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';
import { parseFiscalPeriodParam } from '@/lib/financial/trimestreLabel';
import {
    getDossierControlsSnapshot,
    getLatestAccountingActivityAt,
    isSnapshotStale,
} from '@/lib/financial/dossierControlsStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/dashboard/finance/dossier-controls?year=2026&period=T2
 * Di default legge l’ultima esecuzione persistita (badge Contabilità).
 * ?refresh=1 ricalcola e salva lo snapshot.
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
        const refresh = searchParams.get('refresh') === '1';

        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }

        const periodLabel = period === 'YEAR' ? `Anno ${year}` : `T${quarter} ${year}`;
        const latestActivityAt = await getLatestAccountingActivityAt(year, quarter);

        if (refresh) {
            const controls = await runAndPersistDossierControls(year, quarter);
            const snapshot = await getDossierControlsSnapshot(year, quarter);
            return NextResponse.json({
                ok: true,
                year,
                quarter,
                periodLabel,
                source: 'fresh',
                stale: false,
                ranAt: snapshot?.ranAt || new Date().toISOString(),
                latestActivityAt: latestActivityAt?.toISOString() || null,
                passed: snapshot?.passed ?? controls.filter((c) => c.passed).length,
                total: snapshot?.total ?? controls.length,
                failedCount: snapshot?.failedCount ?? 0,
                notVerifiableCount: snapshot?.notVerifiableCount ?? 0,
                allPassed: (snapshot?.failedCount ?? 0) === 0,
                controls: snapshot?.controls ?? controls,
            });
        }

        const snapshot = await getDossierControlsSnapshot(year, quarter);
        if (!snapshot) {
            return NextResponse.json({
                ok: true,
                year,
                quarter,
                periodLabel,
                source: 'none',
                stale: true,
                ranAt: null,
                latestActivityAt: latestActivityAt?.toISOString() || null,
                passed: 0,
                total: 10,
                failedCount: 0,
                notVerifiableCount: 0,
                allPassed: false,
                controls: [],
                message:
                    'Nessuna misurazione registrata. Premi «Esegui controlli» per calcolare C1–C12.',
            });
        }

        const stale = isSnapshotStale(snapshot, latestActivityAt);
        return NextResponse.json({
            ok: true,
            year,
            quarter,
            periodLabel: snapshot.periodLabel || periodLabel,
            source: 'persisted',
            stale,
            ranAt: snapshot.ranAt,
            latestActivityAt: latestActivityAt?.toISOString() || null,
            passed: snapshot.passed,
            total: snapshot.total,
            failedCount: snapshot.failedCount,
            notVerifiableCount: snapshot.notVerifiableCount,
            allPassed: snapshot.failedCount === 0,
            controls: snapshot.controls,
            message: stale
                ? 'Misurazione non aggiornata — ci sono movimenti successivi all’ultima esecuzione.'
                : undefined,
        });
    } catch (error) {
        console.error('[dossier-controls GET]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore controlli' },
            { status: 500 }
        );
    }
}
