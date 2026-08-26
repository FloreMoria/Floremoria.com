import { NextResponse } from 'next/server';
import { createYoudoxClient } from '@/lib/youdox/client';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';
import { ingestSdiInvoiceUpload } from '@/lib/financial/ingestSdiInvoices';

/**
 * POST /api/v1/finance/youdox/sync/passive
 * Poll fatture passive non lette → download XML → ingestSdiInvoiceUpload → SetFlagRead.
 * Cron-friendly (x-admin-key). Con YOUDOX_DRY_RUN o SOAP non cablato: 501/dry.
 */
export async function POST(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    try {
        const client = createYoudoxClient();
        const unread = await client.listReceivedUnread();
        const results: Array<{
            invoiceKey: string;
            ok: boolean;
            error?: string;
            ingested?: number;
        }> = [];

        for (const inv of unread) {
            const key = inv.InvoiceKey;
            if (!key) continue;
            try {
                const { url } = await client.getDownloadLink(key, 'XMLunsigned');
                const res = await fetch(url);
                if (!res.ok) {
                    results.push({ invoiceKey: key, ok: false, error: `download HTTP ${res.status}` });
                    continue;
                }
                const bytes = Buffer.from(await res.arrayBuffer());
                const name =
                    inv.OriginalFilename?.replace(/\.p7m$/i, '') ||
                    `${key}.xml`;
                const summary = await ingestSdiInvoiceUpload({
                    buffer: bytes,
                    fileName: name.endsWith('.xml') ? name : `${name}.xml`,
                    contentType: 'application/xml',
                });
                await client.setFlagRead(key);
                results.push({
                    invoiceKey: key,
                    ok: true,
                    ingested: summary.imported + summary.updated,
                });
            } catch (inner) {
                results.push({
                    invoiceKey: key,
                    ok: false,
                    error: inner instanceof Error ? inner.message : 'errore sync',
                });
            }
        }

        return NextResponse.json({
            ok: true,
            polled: unread.length,
            results,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Sync passivo fallito';
        console.error('[youdox/sync/passive]', message);
        const status = message.includes('Config assente') ? 503 : message.includes('non ancora cablato') ? 501 : 502;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}
