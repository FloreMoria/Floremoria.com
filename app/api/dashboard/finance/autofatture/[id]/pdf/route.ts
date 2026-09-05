import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getAutofatturaPdfDownload } from '@/lib/financial/autofatturaHistory';

type Ctx = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function contentTypeForFile(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'application/pdf';
}

export async function GET(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        const { bytes, fileName } = await getAutofatturaPdfDownload(id);
        const safeName = fileName.replace(/"/g, '');
        return new NextResponse(Buffer.from(bytes), {
            status: 200,
            headers: {
                'Content-Type': contentTypeForFile(safeName),
                'Content-Disposition': `inline; filename="${safeName}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        console.error('[autofatture pdf]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'PDF non disponibile' },
            { status: 404 }
        );
    }
}
