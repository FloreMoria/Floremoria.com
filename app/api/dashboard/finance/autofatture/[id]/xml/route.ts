import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getAutofatturaXmlDownload } from '@/lib/financial/autofatturaHistory';

type Ctx = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        const { xml, fileName } = await getAutofatturaXmlDownload(id);
        return NextResponse.json({ ok: true, xml, fileName });
    } catch (error) {
        console.error('[autofatture xml]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'XML non disponibile' },
            { status: 404 }
        );
    }
}
