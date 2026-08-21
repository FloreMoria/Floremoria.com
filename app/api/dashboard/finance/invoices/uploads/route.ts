import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    findUploadByFileName,
    listInvoiceUploads,
    type InvoiceUploadChannel,
} from '@/lib/financial/invoiceUploadHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const channelRaw = searchParams.get('channel');
        const checkName = searchParams.get('checkFileName');
        const channel =
            channelRaw === 'SDI_XML' || channelRaw === 'SDI_XLSX'
                ? (channelRaw as InvoiceUploadChannel)
                : undefined;

        if (checkName) {
            const existing = await findUploadByFileName(checkName, channel);
            return NextResponse.json({
                ok: true,
                exists: Boolean(existing),
                upload: existing,
            });
        }

        const uploads = await listInvoiceUploads(channel);
        return NextResponse.json({ ok: true, uploads });
    } catch (error) {
        console.error('[invoices uploads]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Elenco upload non disponibile' },
            { status: 500 }
        );
    }
}
