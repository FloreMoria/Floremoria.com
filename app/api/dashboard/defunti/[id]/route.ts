import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getDeceasedProfileDetail,
    getOrphanDeceasedDetail,
} from '@/lib/deceased/getDeceasedDetail';
import { setDeceasedFlorist } from '@/lib/deceased/setDeceasedFlorist';

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const { searchParams } = new URL(request.url);
        const kind = searchParams.get('kind');

        if (kind === 'orphan') {
            const seedOrderId = searchParams.get('seedOrderId') || id;
            const detail = await getOrphanDeceasedDetail(seedOrderId);
            if (!detail) {
                return NextResponse.json({ ok: false, error: 'Gruppo orfano non trovato.' }, { status: 404 });
            }
            return NextResponse.json({ ok: true, detail });
        }

        const detail = await getDeceasedProfileDetail(id);
        if (!detail) {
            return NextResponse.json({ ok: false, error: 'Defunto non trovato.' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, detail });
    } catch (error) {
        console.error('[defunti GET]', error);
        return NextResponse.json({ ok: false, error: 'Errore interno.' }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id: deceasedProfileId } = await context.params;
        const body = await request.json();
        const partnerId = String(body.partnerId || '').trim();

        if (!partnerId) {
            return NextResponse.json({ ok: false, error: 'partnerId mancante.' }, { status: 400 });
        }

        await setDeceasedFlorist(deceasedProfileId, partnerId);
        const detail = await getDeceasedProfileDetail(deceasedProfileId);
        return NextResponse.json({ ok: true, detail });
    } catch (error) {
        console.error('[defunti PUT florist]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}
