import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getPaypalCsvImportMeta,
    importPaypalCsvBuffer,
} from '@/lib/financial/paypalCsvParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;

/** POST: import storico transazioni PayPal da CSV estratto conto. */
export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof Blob)) {
            return NextResponse.json({ ok: false, error: 'File CSV mancante.' }, { status: 400 });
        }

        const fileName = (file as File).name || 'paypal.csv';
        if (!/\.csv$/i.test(fileName) && file.type !== 'text/csv') {
            return NextResponse.json(
                { ok: false, error: 'Formato non supportato: carica un file .csv PayPal.' },
                { status: 400 }
            );
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json(
                { ok: false, error: 'File troppo grande (max 15 MB).' },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await importPaypalCsvBuffer(buffer, fileName);

        if (result.rowsParsed === 0) {
            return NextResponse.json(
                {
                    ok: false,
                    error: result.warnings[0] || 'CSV senza righe importabili.',
                    warnings: [...result.parseWarnings, ...result.warnings],
                    skippedRows: result.skippedRows,
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            ok: true,
            message: `Import CSV PayPal: ${result.inserted} scritture nuove, ${result.skipped} duplicate saltate.`,
            summary: {
                rowsParsed: result.rowsParsed,
                inserted: result.inserted,
                skipped: result.skipped,
                payments: result.payments,
                fees: result.fees,
                refunds: result.refunds,
                payouts: result.payouts,
                grossInflowEur: (result.grossInflowCents / 100).toFixed(2),
                grossOutflowEur: (result.grossOutflowCents / 100).toFixed(2),
                totalFeesEur: (result.totalFeesCents / 100).toFixed(2),
                skippedRows: result.skippedRows,
            },
            warnings: [...result.parseWarnings, ...result.warnings],
            lastImportAt: result.lastImportAt,
            badge: 'Importato da CSV',
        });
    } catch (error) {
        console.error('[paypal upload-csv]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Import CSV PayPal fallito',
            },
            { status: 500 }
        );
    }
}

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    const meta = await getPaypalCsvImportMeta();
    return NextResponse.json({ ok: true, meta });
}
