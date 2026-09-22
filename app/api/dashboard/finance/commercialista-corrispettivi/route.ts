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
import { listCorrispettiviSnapshots } from '@/lib/financial/corrispettiviRegisterSnapshot';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/dashboard/finance/commercialista-corrispettivi
 * ?year=2026&quarter=2|T2|YEAR&format=xlsx|json
 * ?forceLive=1 — solo diagnostica: ricalcola senza toccare lo snapshot
 * ?rettifica=motivo — nuova versione congelata (motivo obbligatorio)
 * ?listSnapshots=1 — elenco versioni (json)
 *
 * Export commercialista: soli F1+F2. Dopo il primo freeze, il download legge lo snapshot
 * immutabile (METODO — congelamento registro corrispettivi).
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
        const forceLive = searchParams.get('forceLive') === '1';
        const rettificaMotivo = (searchParams.get('rettifica') || '').trim() || null;
        const listSnapshots = searchParams.get('listSnapshots') === '1';

        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }

        const period: CommercialistaPeriod =
            periodParam === 'YEAR'
                ? { kind: 'year', year }
                : { kind: 'quarter', year, quarter: periodParam as TaxQuarter };

        const quarterKey = period.kind === 'year' ? 0 : period.quarter;

        if (listSnapshots) {
            const versions = await listCorrispettiviSnapshots(year, quarterKey);
            return NextResponse.json({ ok: true, year, quarter: quarterKey, versions });
        }

        if (rettificaMotivo && rettificaMotivo.length < 8) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Rettifica: indicare un motivo esplicito (min 8 caratteri).',
                },
                { status: 400 }
            );
        }

        const { buffer, preview, fromSnapshot, snapshotVersion, contentHash, provisional } =
            await buildCommercialistaCorrispettiviXlsxOrdered(period, {
                forceLive,
                rettificaMotivo,
            });

        if (format === 'json') {
            return NextResponse.json({
                ok: true,
                preview,
                fromSnapshot,
                snapshotVersion,
                contentHash,
                provisional,
                forceLive,
                rettifica: Boolean(rettificaMotivo),
            });
        }

        const stamp =
            period.kind === 'year'
                ? `${year}_ANNO`
                : `${year}_${fiscalPeriodFilenameStamp(period.quarter)}`;
        const filename = preview.filename || `FloreMoria_${stamp}_Corrispettivi.xlsx`;

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type':
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
                'X-Floremoria-Corrispettivi-Snapshot': fromSnapshot ? '1' : '0',
                'X-Floremoria-Corrispettivi-Provisional': provisional ? '1' : '0',
                'X-Floremoria-Corrispettivi-Version':
                    snapshotVersion != null ? String(snapshotVersion) : '',
                'X-Floremoria-Corrispettivi-Hash': contentHash || '',
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
