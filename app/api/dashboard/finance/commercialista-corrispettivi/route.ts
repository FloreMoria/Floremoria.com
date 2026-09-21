import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    buildCommercialistaCorrispettiviXlsxOrdered,
    CommercialistaConsistencyError,
    CommercialistaSelfCheckError,
    type CommercialistaPeriod,
} from '@/lib/financial/commercialistaCorrispettiviXlsx';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';
import {
    fiscalPeriodFilenameStamp,
    parseFiscalPeriodParam,
} from '@/lib/financial/trimestreLabel';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/dashboard/finance/commercialista-corrispettivi
 * ?year=2026&quarter=2|T2|YEAR&format=xlsx|json
 *
 * Export commercialista: soli F1+F2 (Registro Corrispettivi). F3 sospeso.
 * NON passa dai controlli dossier C1–C15: C15 rosso non può bloccare questo download
 * (fonte = registro corrispettivi, indipendente da Erario/CE).
 */
export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const year = Number(searchParams.get('year') || new Date().getFullYear());
        const periodParam = parseFiscalPeriodParam(
            searchParams.get('period') ||
                searchParams.get('quarter') ||
                searchParams.get('trimestre')
        );
        const format = (searchParams.get('format') || 'xlsx').toLowerCase();

        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }

        const period: CommercialistaPeriod =
            periodParam === 'YEAR'
                ? { kind: 'year', year }
                : { kind: 'quarter', year, quarter: periodParam as TaxQuarter };

        const { buffer, preview } = await buildCommercialistaCorrispettiviXlsxOrdered(period);

        if (format === 'json') {
            return NextResponse.json({ ok: true, preview });
        }

        const stamp =
            period.kind === 'year' ? `${year}_ANNO` : `${year}_${fiscalPeriodFilenameStamp(period.quarter)}`;
        const filename = preview.filename || `FloreMoria_${stamp}_Corrispettivi.xlsx`;

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type':
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[commercialista-corrispettivi GET]', error);
        if (error instanceof CommercialistaSelfCheckError) {
            return NextResponse.json(
                {
                    ok: false,
                    error: error.message,
                    check: error.check,
                    failingRows: error.failingRows,
                    amountCents: error.amountCents,
                },
                { status: 422 }
            );
        }
        if (error instanceof CommercialistaConsistencyError) {
            return NextResponse.json(
                { ok: false, error: error.message, diffs: error.diffs },
                { status: 422 }
            );
        }
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Errore export commercialista',
            },
            { status: 500 }
        );
    }
}
