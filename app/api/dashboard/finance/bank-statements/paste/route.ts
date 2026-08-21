import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    confirmFinecoPaste,
    previewFinecoPaste,
} from '@/lib/financial/bankStatements/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_CHARS = 500_000;

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const body = (await request.json().catch(() => null)) as {
            action?: string;
            text?: string;
        } | null;

        const action = body?.action === 'confirm' ? 'confirm' : 'preview';
        const text = typeof body?.text === 'string' ? body.text.trim() : '';

        if (!text) {
            return jsonError('Incolla il testo dei movimenti Fineco.', 400);
        }
        if (text.length > MAX_CHARS) {
            return jsonError('Testo troppo lungo (max 500.000 caratteri).', 400);
        }

        if (action === 'preview') {
            const preview = await previewFinecoPaste(text);
            if (preview.rows.length === 0) {
                return NextResponse.json(
                    {
                        ok: false,
                        error:
                            'Nessun movimento riconosciuto. Copia l’elenco dalla lista movimenti Fineco (giorno, mese, causale, tipologia, importo EUR).',
                        ...preview,
                    },
                    { status: 422 }
                );
            }
            return NextResponse.json({ ok: true, ...preview });
        }

        const result = await confirmFinecoPaste(text);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error('[bank-statements paste]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Elaborazione incolla Fineco fallita',
            500
        );
    }
}
