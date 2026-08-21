import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { ingestSdiInvoiceUpload } from '@/lib/financial/ingestSdiInvoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BYTES = 40 * 1024 * 1024;
const ALLOWED = /\.(zip|xml|csv)$/i;

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        let form: FormData;
        try {
            form = await request.formData();
        } catch (err) {
            console.error('[invoices upload] formData', err);
            return jsonError('Impossibile leggere il multipart/form-data.', 400);
        }

        const file = form.get('file');
        const isBlob = typeof Blob !== 'undefined' && file instanceof Blob;
        if (!isBlob) return jsonError('File mancante (campo file)', 400);

        const blob = file as Blob & { name?: string };
        const fileName =
            (typeof blob.name === 'string' && blob.name) ||
            String(form.get('fileName') || 'fatture.zip');

        if (!ALLOWED.test(fileName)) {
            return jsonError('Formato non supportato. Usa ZIP (XML FatturaPA), XML o CSV YouDoox/SDI.', 400);
        }
        if (blob.size > MAX_BYTES) {
            return jsonError('File troppo grande (max 40 MB).', 400);
        }

        const buffer = Buffer.from(await blob.arrayBuffer());
        const summary = await ingestSdiInvoiceUpload({
            buffer,
            fileName,
            contentType: blob.type || 'application/octet-stream',
        });

        const totalEuro = (summary.totalCents / 100).toLocaleString('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        const filesN = summary.filesProcessed || 1;
        const message =
            `${filesN} file elaborati: ${summary.passiveInvoices} passive, ${summary.foreignAutofatture} autofatture, ${summary.activeInvoices} attive, ${summary.skippedDuplicates} duplicati` +
            (summary.imported > 0 || summary.updated > 0
                ? ` · importate ${summary.imported} · aggiornate ${summary.updated} (${totalEuro} €)`
                : '') +
            (summary.matchedFineco > 0
                ? ` · ${summary.matchedFineco} abbinate Fineco`
                : '');

        return NextResponse.json({
            ok:
                summary.imported > 0 ||
                summary.updated > 0 ||
                summary.skippedDuplicates > 0 ||
                summary.activeInvoices > 0,
            message,
            summary,
        });
    } catch (error) {
        console.error('[invoices upload]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Import fatture fallito',
            500
        );
    }
}
