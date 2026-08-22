import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    deleteInvoiceExpense,
    deleteInvoiceUpload,
    findUploadByFileName,
    getInvoiceExpenseDetail,
    listInvoiceUploads,
    listInvoicesForUpload,
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
        const detailId = searchParams.get('id');
        const expenseId = searchParams.get('expenseId');
        const channel =
            channelRaw === 'SDI_XML' || channelRaw === 'SDI_XLSX'
                ? (channelRaw as InvoiceUploadChannel)
                : undefined;

        if (expenseId) {
            const invoice = await getInvoiceExpenseDetail(expenseId);
            return NextResponse.json({ ok: true, invoice });
        }

        if (detailId) {
            const detail = await listInvoicesForUpload(detailId);
            return NextResponse.json({ ok: true, ...detail });
        }

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

export async function DELETE(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const expenseId = searchParams.get('expenseId');
        if (expenseId) {
            const result = await deleteInvoiceExpense(expenseId);
            return NextResponse.json({ ok: true, ...result });
        }
        if (!id) {
            return NextResponse.json({ ok: false, error: 'id upload obbligatorio' }, { status: 400 });
        }
        const result = await deleteInvoiceUpload(id);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error('[invoices uploads DELETE]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Eliminazione upload fallita',
            },
            { status: 400 }
        );
    }
}
