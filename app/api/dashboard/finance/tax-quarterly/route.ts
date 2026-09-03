import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    buildTaxQuarterlyReport,
    type TaxQuarter,
} from '@/lib/financial/taxQuarterly';
import { buildTaxQuarterlyXlsxBuffer } from '@/lib/financial/taxQuarterlyXlsx';
import { buildPaypalMonthlyFeesCsv } from '@/lib/financial/paypalMonthlyFees';
import {
    fiscalPeriodFilenameStamp,
    parseFiscalPeriodParam,
} from '@/lib/financial/trimestreLabel';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/dashboard/finance/tax-quarterly
 * ?year=2026&quarter=2|T2|Q2|YEAR|ALL&period=T2&month=9&format=json|csv|xlsx|paypal-fees-csv
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
                searchParams.get('trimestre'),
        );
        const fullYear = period === 'YEAR';
        const quarter = (fullYear ? 1 : period) as TaxQuarter;
        const monthRaw = searchParams.get('month');
        const month =
            monthRaw != null && monthRaw !== ''
                ? Math.min(12, Math.max(1, Number(monthRaw)))
                : null;
        const format = (searchParams.get('format') || 'json').toLowerCase();

        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }

        const report = await buildTaxQuarterlyReport(year, quarter, {
            month: Number.isFinite(month as number) ? month : null,
            fullYear: fullYear && month == null,
        });

        const stamp = month
            ? report.bounds.label.replace(/[/\s]+/g, '_')
            : `${year}_${fiscalPeriodFilenameStamp(period)}`;
        const filename = `Dossier_Fiscale_FloreMoria_${stamp}.xlsx`;

        if (format === 'paypal-fees-csv') {
            const csv = buildPaypalMonthlyFeesCsv(report.paypalMonthlyFees);
            const feeName = `FloreMoria_PayPal_Fee_Mensili_${report.bounds.label.replace(/\s+/g, '_')}.csv`;
            return new NextResponse(csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${feeName}"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        if (
            format === 'xlsx' ||
            format === 'excel' ||
            format === 'dossier' ||
            format === 'csv'
        ) {
            const buffer = await buildTaxQuarterlyXlsxBuffer(report);
            return new NextResponse(new Uint8Array(buffer), {
                status: 200,
                headers: {
                    'Content-Type':
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'Cache-Control': 'no-store',
                    ...(format === 'csv'
                        ? { 'X-Floremoria-Note': 'csv-deprecated-use-xlsx-dossier' }
                        : {}),
                },
            });
        }

        return NextResponse.json({ ok: true, report });
    } catch (error) {
        console.error('[tax-quarterly GET]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? errMessage(error) : 'Errore report' },
            { status: 500 },
        );
    }
}

function errMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Errore report';
}
