import { NextResponse } from 'next/server';
import { createYoudoxClient } from '@/lib/youdox/client';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';
import type { YoudoxInvoicesFilter } from '@/lib/youdox/types';

/**
 * GET /api/v1/finance/youdox/invoices/received
 * Query: onlyUnread=true | timestampFrom/To | partitaIva
 * Mappa: Invoices_ListReceived* → poi download + ingestSdiInvoiceUpload
 */
export async function GET(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    try {
        const url = new URL(request.url);
        const onlyUnread = url.searchParams.get('onlyUnread') !== 'false';
        const client = createYoudoxClient();

        if (onlyUnread && !url.searchParams.get('timestampFrom') && !url.searchParams.get('partitaIva')) {
            const invoices = await client.listReceivedUnread();
            return NextResponse.json({ ok: true, invoices });
        }

        const filter: YoudoxInvoicesFilter = {
            OnlyUnread: onlyUnread,
            TimestampFrom: url.searchParams.get('timestampFrom') || undefined,
            TimestampTo: url.searchParams.get('timestampTo') || undefined,
            DataFatturaFrom: url.searchParams.get('dataFatturaFrom') || undefined,
            DataFatturaTo: url.searchParams.get('dataFatturaTo') || undefined,
            PartitaIVA: url.searchParams.get('partitaIva') || undefined,
        };

        const invoices = await client.listReceivedByFilter(filter);
        return NextResponse.json({ ok: true, invoices });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'List received fallita';
        console.error('[youdox/received]', message);
        const status = message.includes('Config assente') ? 503 : message.includes('non ancora cablato') ? 501 : 502;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}
