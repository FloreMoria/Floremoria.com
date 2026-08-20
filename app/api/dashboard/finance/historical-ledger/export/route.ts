import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    buildHistoricalLedgerCsv,
    buildHistoricalLedgerXlsxBuffer,
} from '@/lib/financial/historicalLedgerQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const url = new URL(request.url);
        const format = (url.searchParams.get('format') || 'xlsx').toLowerCase();
        const fiscalYear = Number(url.searchParams.get('year') || new Date().getFullYear());
        const q = url.searchParams.get('quarter');
        const fiscalQuarter = q ? Number(q) : null;
        const month = url.searchParams.get('month')
            ? Number(url.searchParams.get('month'))
            : null;
        const direction = (url.searchParams.get('direction') || 'ALL') as
            | 'ALL'
            | 'ENTRATA'
            | 'USCITA';
        const category = url.searchParams.get('category') || 'ALL';

        const filters = {
            fiscalYear,
            fiscalQuarter:
                fiscalQuarter && fiscalQuarter >= 1 && fiscalQuarter <= 4 ? fiscalQuarter : null,
            month,
            direction,
            category,
            take: 5000,
        };

        const stamp = `${fiscalYear}${fiscalQuarter ? `-Q${fiscalQuarter}` : ''}`;

        if (format === 'csv') {
            const csv = await buildHistoricalLedgerCsv(filters);
            return new Response(csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="libro-giornale-${stamp}.csv"`,
                },
            });
        }

        const buf = await buildHistoricalLedgerXlsxBuffer(filters);
        return new Response(new Uint8Array(buf), {
            status: 200,
            headers: {
                'Content-Type':
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="libro-giornale-${stamp}.xlsx"`,
            },
        });
    } catch (error) {
        console.error('[historical-ledger export]', error);
        return Response.json(
            { ok: false, error: error instanceof Error ? error.message : 'Export fallito' },
            { status: 500 }
        );
    }
}
