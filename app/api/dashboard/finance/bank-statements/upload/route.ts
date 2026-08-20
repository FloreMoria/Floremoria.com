import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { ensurePdfDomPolyfills } from '@/lib/financial/bankStatements/pdfDomPolyfill';
import { uploadAndProcessBankStatement } from '@/lib/financial/bankStatements/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Polyfill DOMMatrix/DOMPoint prima di qualsiasi parsing PDF (Node/Vercel serverless)
ensurePdfDomPolyfills();

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|csv|xlsx|xls)$/i;

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
            console.error('[bank-statements upload] formData parse failed', err);
            return jsonError(
                'Impossibile leggere il multipart/form-data. Riprova con un file più piccolo o un formato supportato.',
                400
            );
        }

        const file = form.get('file');
        // In Node runtime il campo può essere File o Blob con name.
        const isBlob = typeof Blob !== 'undefined' && file instanceof Blob;
        if (!isBlob) {
            return jsonError('File mancante (campo file)', 400);
        }

        const blob = file as Blob & { name?: string };
        const fileName = (typeof blob.name === 'string' && blob.name) || String(form.get('fileName') || 'estratto.csv');

        if (!ALLOWED_EXT.test(fileName)) {
            return jsonError('Formato non supportato. Usa PDF, CSV o Excel (.xlsx/.xls).', 400);
        }

        if (blob.size > MAX_BYTES) {
            return jsonError('File troppo grande (max 15 MB).', 400);
        }

        const buffer = Buffer.from(await blob.arrayBuffer());
        const document = await uploadAndProcessBankStatement({
            fileName,
            contentType: blob.type || 'application/octet-stream',
            buffer,
        });

        // File archiviato anche se il parsing non ha estratto movimenti (es. PDF scan)
        if (document?.status === 'FAILED') {
            const preview =
                (document as { textPreview?: string[] }).textPreview ||
                ((document.metadataJson as { textPreview?: string[] } | null)?.textPreview ??
                    undefined);
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        document.parseError ||
                        'File salvato ma elaborazione fallita. Preferisci CSV/Excel Fineco.',
                    document,
                    textPreview: preview,
                },
                { status: 422 }
            );
        }

        return NextResponse.json({ ok: true, document });
    } catch (error) {
        console.error('[bank-statements upload]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Elaborazione rendiconto fallita',
            500
        );
    }
}
