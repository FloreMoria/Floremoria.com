import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    createDeceasedManual,
    registerOrphanDeceasedFromSeedOrder,
} from '@/lib/deceased/registerOrphanDeceased';

/** POST collection: crea anagrafica o registra gruppo orfano. */
export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = await request.json();
        const action = String(body.action || 'create_manual').trim();

        if (action === 'register_orphan') {
            const seedOrderId = String(body.seedOrderId || '').trim();
            if (!seedOrderId) {
                return NextResponse.json({ ok: false, error: 'seedOrderId mancante.' }, { status: 400 });
            }
            const profileId = await registerOrphanDeceasedFromSeedOrder(seedOrderId);
            return NextResponse.json({ ok: true, deceasedProfileId: profileId });
        }

        if (action === 'create_manual' || action === 'create') {
            const fullName =
                String(body.fullName || '').trim() ||
                [body.firstName, body.lastName]
                    .map((p) => String(p || '').trim())
                    .filter(Boolean)
                    .join(' ');
            const profileId = await createDeceasedManual({
                fullName,
                cemeteryCity: String(body.cemeteryCity || ''),
                cemeteryName: body.cemeteryName ?? null,
                verifiedNotes: body.verifiedNotes ?? body.dedication ?? null,
            });
            return NextResponse.json({
                ok: true,
                deceasedProfileId: profileId,
                message: 'Profilo creato con successo',
            });
        }

        return NextResponse.json({ ok: false, error: 'Azione non supportata.' }, { status: 400 });
    } catch (error) {
        console.error('[deceased POST]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}
