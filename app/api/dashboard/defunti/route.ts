import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    createDeceasedManual,
    registerOrphanDeceasedFromSeedOrder,
} from '@/lib/deceased/registerOrphanDeceased';
import { listDeceasedLeaderRows } from '@/lib/deceased/listDeceasedLeaderRows';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const rows = await listDeceasedLeaderRows();
        return NextResponse.json({ ok: true, rows });
    } catch (error) {
        console.error('[defunti GET]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = await request.json();
        const action = String(body.action || '').trim();

        if (action === 'register_orphan') {
            const seedOrderId = String(body.seedOrderId || '').trim();
            if (!seedOrderId) {
                return NextResponse.json({ ok: false, error: 'seedOrderId mancante.' }, { status: 400 });
            }
            const profileId = await registerOrphanDeceasedFromSeedOrder(seedOrderId);
            return NextResponse.json({ ok: true, deceasedProfileId: profileId });
        }

        if (action === 'create_manual') {
            const profileId = await createDeceasedManual({
                fullName: String(body.fullName || ''),
                cemeteryCity: String(body.cemeteryCity || ''),
                cemeteryName: body.cemeteryName ?? null,
                verifiedNotes: body.verifiedNotes ?? null,
            });
            return NextResponse.json({ ok: true, deceasedProfileId: profileId });
        }

        return NextResponse.json({ ok: false, error: 'Azione non supportata.' }, { status: 400 });
    } catch (error) {
        console.error('[defunti POST]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}

