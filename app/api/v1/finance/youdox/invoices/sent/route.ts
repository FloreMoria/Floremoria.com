import { NextResponse } from 'next/server';
import { createYoudoxClient } from '@/lib/youdox/client';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';
import type { YoudoxInvoicesFilter } from '@/lib/youdox/types';

/**
 * GET /api/v1/finance/youdox/invoices/sent
 * Query: timestampFrom, timestampTo, status, partitaIva, filename
 * Mappa: Invoices_ListSentByFilter | ListSentByFilename + GetStatusReport via /status-report
 */
export async function GET(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    try {
        const url = new URL(request.url);
        const filename = url.searchParams.get('filename')?.trim();
        const client = createYoudoxClient();

        if (filename) {
            const invoice = await client.listSentByFilename(filename);
            return NextResponse.json({ ok: true, invoice });
        }

        const filter: YoudoxInvoicesFilter = {
            TimestampFrom: url.searchParams.get('timestampFrom') || undefined,
            TimestampTo: url.searchParams.get('timestampTo') || undefined,
            DataFatturaFrom: url.searchParams.get('dataFatturaFrom') || undefined,
            DataFatturaTo: url.searchParams.get('dataFatturaTo') || undefined,
            PartitaIVA: url.searchParams.get('partitaIva') || undefined,
            Status: url.searchParams.get('status') || undefined,
            ShowAlsoDeleted: url.searchParams.get('showAlsoDeleted') === 'true',
        };

        const invoices = await client.listSentByFilter(filter);
        return NextResponse.json({ ok: true, invoices });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'List sent fallita';
        console.error('[youdox/sent]', message);
        const status = message.includes('Config assente') ? 503 : message.includes('non ancora cablato') ? 501 : 502;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}
