import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { uploadAndProcessBankStatement } from '@/lib/financial/bankStatements/store';

export const runtime = 'nodejs';

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|csv|xlsx|xls)$/i;

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ ok: false, error: 'File mancante (campo file)' }, { status: 400 });
        }

        if (!ALLOWED_EXT.test(file.name)) {
            return NextResponse.json(
                { ok: false, error: 'Formato non supportato. Usa PDF, CSV o Excel (.xlsx/.xls).' },
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
        const document = await uploadAndProcessBankStatement({
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            buffer,
        });

        return NextResponse.json({ ok: true, document });
    } catch (error) {
        console.error('[bank-statements upload]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Elaborazione rendiconto fallita',
            },
            { status: 500 }
        );
    }
}
