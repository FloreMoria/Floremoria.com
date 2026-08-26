import { NextResponse } from 'next/server';
import { createYoudoxClient } from '@/lib/youdox/client';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';
import type { YoudoxDownloadType } from '@/lib/youdox/types';

const ALLOWED: YoudoxDownloadType[] = [
    'XML',
    'XMLunsigned',
    'PdfADE',
    'PdfDocumiSimple',
    'AttachmentsPack',
    'EvidencesPack',
];

/**
 * GET /api/v1/finance/youdox/invoices/[invoiceKey]/download?type=XML|EvidencesPack|…
 * Mappa: Invoices_GetDownloadLink (URL firmato ~5 min)
 */
export async function GET(
    request: Request,
    ctx: { params: Promise<{ invoiceKey: string }> }
) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    try {
        const { invoiceKey } = await ctx.params;
        if (!invoiceKey?.trim()) {
            return NextResponse.json({ ok: false, error: 'invoiceKey obbligatorio' }, { status: 400 });
        }

        const url = new URL(request.url);
        const type = (url.searchParams.get('type') || 'XML') as YoudoxDownloadType;
        if (!ALLOWED.includes(type)) {
            return NextResponse.json(
                { ok: false, error: `type non valido. Ammessi: ${ALLOWED.join(', ')}` },
                { status: 400 }
            );
        }

        const client = createYoudoxClient();
        const link = await client.getDownloadLink(invoiceKey.trim(), type);
        return NextResponse.json({ ok: true, ...link, invoiceKey: invoiceKey.trim(), type });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Download link fallito';
        console.error('[youdox/download]', message);
        const status = message.includes('Config assente') ? 503 : message.includes('non ancora cablato') ? 501 : 502;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}
