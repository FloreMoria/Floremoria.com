import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    createManualExpense,
    listManualExpenses,
    sumManualExpensesCents,
    type ManualDocType,
} from '@/lib/financial/manualExpenses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED = /\.(pdf|png|jpe?g|webp|heic)$/i;
const MAX_BYTES = 12 * 1024 * 1024;

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    try {
        const [expenses, totalCents] = await Promise.all([
            listManualExpenses(150),
            sumManualExpensesCents(),
        ]);
        return NextResponse.json({ ok: true, expenses, totalCents });
    } catch (error) {
        console.error('[manual-expenses GET]', error);
        return NextResponse.json({ ok: false, error: 'Lettura spese fallita' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const form = await request.formData();
        const vendorName = String(form.get('vendorName') || '').trim();
        const description = String(form.get('description') || '').trim();
        const expenseDate = String(form.get('expenseDate') || '').trim();
        const docTypeRaw = String(form.get('docType') || 'FATTURA').toUpperCase();
        const docType = (['FATTURA', 'SCONTRINO', 'RICEVUTA'].includes(docTypeRaw)
            ? docTypeRaw
            : 'FATTURA') as ManualDocType;
        const totalEuros = Number(String(form.get('totalAmount') || '').replace(',', '.'));
        const vatRate = Number(String(form.get('vatRate') || '0').replace(',', '.'));

        if (!vendorName || !description || !expenseDate || !Number.isFinite(totalEuros)) {
            return NextResponse.json(
                { ok: false, error: 'Compila data, fornitore, descrizione e importo.' },
                { status: 400 }
            );
        }

        let filePayload: { buffer: Buffer; fileName: string; contentType: string } | null = null;
        const file = form.get('file');
        if (file instanceof Blob) {
            const blob = file as Blob & { name?: string };
            const fileName = blob.name || String(form.get('fileName') || 'allegato.pdf');
            if (!ALLOWED.test(fileName)) {
                return NextResponse.json(
                    { ok: false, error: 'Allegato non supportato (PDF/immagine).' },
                    { status: 400 }
                );
            }
            if (blob.size > MAX_BYTES) {
                return NextResponse.json({ ok: false, error: 'Allegato troppo grande (max 12 MB).' }, { status: 400 });
            }
            filePayload = {
                buffer: Buffer.from(await blob.arrayBuffer()),
                fileName,
                contentType: blob.type || 'application/octet-stream',
            };
        }

        const expense = await createManualExpense({
            expenseDate,
            docType,
            vendorName,
            description,
            totalCents: Math.round(totalEuros * 100),
            vatRate: Number.isFinite(vatRate) ? vatRate : 0,
            file: filePayload,
            notes: form.get('notes') ? String(form.get('notes')) : null,
        });

        return NextResponse.json({ ok: true, expense });
    } catch (error) {
        console.error('[manual-expenses POST]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Salvataggio fallito' },
            { status: 500 }
        );
    }
}
