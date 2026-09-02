import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    buildTaxQuarterlyCsv,
    buildTaxQuarterlyReport,
    type TaxQuarter,
} from '@/lib/financial/taxQuarterly';
import { buildTaxQuarterlyXlsxBuffer } from '@/lib/financial/taxQuarterlyXlsx';
import { buildPaypalMonthlyFeesCsv } from '@/lib/financial/paypalMonthlyFees';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parseQuarter(raw: string | null): TaxQuarter {
    const n = Number(raw || '0');
    if (n === 1 || n === 2 || n === 3 || n === 4) return n;
    // Default: trimestre corrente
    const m = new Date().getMonth();
    return (Math.floor(m / 3) + 1) as TaxQuarter;
}

/**
 * GET /api/dashboard/finance/tax-quarterly?year=2026&quarter=3&format=json|csv|paypal-fees-csv
 */
export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const year = Number(searchParams.get('year') || new Date().getFullYear());
        const quarter = parseQuarter(searchParams.get('quarter'));
        const format = (searchParams.get('format') || 'json').toLowerCase();

        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }

        const report = await buildTaxQuarterlyReport(year, quarter);

        if (format === 'paypal-fees-csv') {
            const csv = buildPaypalMonthlyFeesCsv(report.paypalMonthlyFees);
            const filename = `FloreMoria_PayPal_Fee_Mensili_Q${quarter}_${year}.csv`;
            return new NextResponse(csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        if (format === 'xlsx' || format === 'excel') {
            const buffer = await buildTaxQuarterlyXlsxBuffer(report);
            const filename = `FloreMoria_Prospetto_Fiscale_Q${quarter}_${year}.xlsx`;
            return new NextResponse(new Uint8Array(buffer), {
                status: 200,
                headers: {
                    'Content-Type':
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        if (format === 'csv') {
            const csv = buildTaxQuarterlyCsv(report);
            const filename = `FloreMoria_Prospetto_Fiscale_Q${quarter}_${year}.csv`;
            return new NextResponse(csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        return NextResponse.json({ ok: true, report });
    } catch (error) {
        console.error('[tax-quarterly GET]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore report' },
            { status: 500 }
        );
    }
}
