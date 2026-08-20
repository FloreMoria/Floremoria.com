import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getBankStatementDetail,
    readStatementBytes,
} from '@/lib/financial/bankStatements/store';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        const document = await getBankStatementDetail(id);
        if (!document) {
            return NextResponse.json({ ok: false, error: 'Documento non trovato' }, { status: 404 });
        }

        const bytes = await readStatementBytes(
            document.blobPath,
            document.storageKind,
            document.blobUrl
        );

        return new NextResponse(new Uint8Array(bytes), {
            status: 200,
            headers: {
                'Content-Type': document.contentType || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${document.fileName.replace(/"/g, '')}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        console.error('[bank-statements download]', error);
        return NextResponse.json({ ok: false, error: 'Download fallito' }, { status: 500 });
    }
}
