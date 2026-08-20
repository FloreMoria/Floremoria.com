import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { uploadSaasForeignInvoice } from '@/lib/financial/saasForeignInvoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = /\.(pdf|xml|png|jpe?g|webp)$/i;

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

function eurosToCents(raw: FormDataEntryValue | null): number {
    const n = Number(String(raw ?? '').replace(',', '.'));
    if (!Number.isFinite(n)) return NaN;
    return Math.round(n * 100);
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        let form: FormData;
        try {
            form = await request.formData();
        } catch (err) {
            console.error('[saas-invoices upload] formData', err);
            return jsonError('Multipart non valido', 400);
        }

        const file = form.get('file');
        if (!(typeof Blob !== 'undefined' && file instanceof Blob)) {
            return jsonError('File mancante', 400);
        }
        const blob = file as Blob & { name?: string };
        const fileName =
            (typeof blob.name === 'string' && blob.name) ||
            String(form.get('fileName') || 'fattura.pdf');

        if (!ALLOWED.test(fileName)) {
            return jsonError('Formato non supportato (PDF, XML, PNG, JPG, WEBP).', 400);
        }
        if (blob.size > MAX_BYTES) {
            return jsonError('File troppo grande (max 12 MB).', 400);
        }

        const vendorName = String(form.get('vendorName') || '').trim();
        const invoiceDate = String(form.get('invoiceDate') || '').trim();
        if (!vendorName || !invoiceDate) {
            return jsonError('Fornitore e data fattura obbligatori.', 400);
        }

        const originalAmountCents = eurosToCents(form.get('originalAmount'));
        const eurAmountRaw = form.get('eurAmount');
        const eurAmountCents = eurAmountRaw
            ? eurosToCents(eurAmountRaw)
            : originalAmountCents;

        if (!Number.isFinite(originalAmountCents) || !Number.isFinite(eurAmountCents)) {
            return jsonError('Importi non validi.', 400);
        }

        const jurisdiction = String(form.get('jurisdiction') || 'EXTRA_UE').toUpperCase() === 'UE'
            ? 'UE'
            : 'EXTRA_UE';
        const autofatturaRaw = String(form.get('autofatturaType') || 'TD17').toUpperCase();
        const autofatturaType =
            autofatturaRaw === 'TD18' || autofatturaRaw === 'NONE' || autofatturaRaw === 'TD17'
                ? autofatturaRaw
                : 'TD17';

        const invoice = await uploadSaasForeignInvoice({
            fileName,
            contentType: blob.type || 'application/octet-stream',
            buffer: Buffer.from(await blob.arrayBuffer()),
            invoiceDate,
            vendorName,
            originalCurrency: String(form.get('originalCurrency') || 'EUR'),
            originalAmountCents,
            eurAmountCents,
            countryCode: form.get('countryCode') ? String(form.get('countryCode')) : null,
            jurisdiction,
            autofatturaType: autofatturaType as 'NONE' | 'TD17' | 'TD18',
            notes: form.get('notes') ? String(form.get('notes')) : null,
        });

        return NextResponse.json({ ok: true, invoice });
    } catch (error) {
        console.error('[saas-invoices upload]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Upload fattura fallito',
            500
        );
    }
}
