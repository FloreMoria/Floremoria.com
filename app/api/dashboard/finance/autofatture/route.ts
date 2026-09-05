import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { listGeneratedAutofatture } from '@/lib/financial/autofatturaHistory';
import { normalizePrimaNotaPeriodKey } from '@/lib/financial/trimestreLabel';
import type { PrimaNotaPeriodKey } from '@/lib/financial/primaNotaShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/finance/autofatture?year=2026&period=T2|YEAR
 */
export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const yearRaw = searchParams.get('year');
        const year =
            yearRaw != null && yearRaw !== ''
                ? Number(yearRaw)
                : new Date().getFullYear();
        const period =
            (normalizePrimaNotaPeriodKey(
                searchParams.get('period') || searchParams.get('quarter'),
            ) as PrimaNotaPeriodKey | null) || 'YEAR';

        const items = await listGeneratedAutofatture({
            year: Number.isFinite(year) ? year : new Date().getFullYear(),
            periodKey: period,
        });

        const totals = items.reduce(
            (acc, h) => {
                acc.imponibileCents += h.imponibileCents;
                acc.vatCents += h.vatCents;
                acc.totaleCents += h.totaleCents;
                return acc;
            },
            { imponibileCents: 0, vatCents: 0, totaleCents: 0 },
        );

        return NextResponse.json({
            ok: true,
            count: items.length,
            year: Number.isFinite(year) ? year : new Date().getFullYear(),
            period,
            totals,
            items,
        });
    } catch (error) {
        console.error('[autofatture list]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Storico non disponibile' },
            { status: 500 },
        );
    }
}
