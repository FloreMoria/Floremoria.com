import { NextResponse } from 'next/server';
import { createYoudoxClient } from '@/lib/youdox/client';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';

/**
 * GET /api/v1/finance/youdox/status-report?from=ISO&to=ISO&xlsx=0|1
 * Mappa: Invoices_GetStatusReport — unica fonte “storico stati” SdI (RC/NS/NE/DT/MC/AT).
 * Nota specifiche: non esiste poll puntuale sul singolo invio; usare report o ListSent*.Status.
 */
export async function GET(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    try {
        const url = new URL(request.url);
        const from = url.searchParams.get('from')?.trim();
        const to = url.searchParams.get('to')?.trim();
        if (!from || !to) {
            return NextResponse.json(
                { ok: false, error: 'from e to (ISO datetime) obbligatori' },
                { status: 400 }
            );
        }

        const useXlsx = url.searchParams.get('xlsx') === '1' || url.searchParams.get('xlsx') === 'true';
        const client = createYoudoxClient();
        const buf = await client.getStatusReport({ from, to, useXlsx });

        const contentType = useXlsx
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv; charset=utf-8';
        const filename = useXlsx ? `youdox-status-${from.slice(0, 10)}.xlsx` : `youdox-status-${from.slice(0, 10)}.csv`;

        return new NextResponse(new Uint8Array(buf), {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Status report fallito';
        console.error('[youdox/status-report]', message);
        const status = message.includes('Config assente') ? 503 : message.includes('non ancora cablato') ? 501 : 502;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}
