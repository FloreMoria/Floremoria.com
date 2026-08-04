import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getDeceasedProfileDetail,
    getOrphanDeceasedDetail,
} from '@/lib/deceased/getDeceasedDetail';
import { setDeceasedFlorist } from '@/lib/deceased/setDeceasedFlorist';
import {
    deleteDeceasedProfileSafe,
    linkOrderToDeceased,
    linkUserToDeceased,
    updateDeceasedProfileFull,
} from '@/lib/deceased/updateDeceasedProfileFull';

type IdContext = { params: Promise<{ id: string }> };

export async function deceasedGetById(request: Request, context: IdContext) {
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
        console.error('[deceased GET]', error);
        return NextResponse.json({ ok: false, error: 'Errore interno.' }, { status: 500 });
    }
}

async function deceasedUpdateById(request: Request, context: IdContext) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id: deceasedProfileId } = await context.params;
        const body = await request.json();
        const action = String(body.action || 'update_profile').trim();

        if (action === 'set_florist') {
            const partnerId = String(body.partnerId || '').trim();
            if (!partnerId) {
                return NextResponse.json({ ok: false, error: 'partnerId mancante.' }, { status: 400 });
            }
            await setDeceasedFlorist(deceasedProfileId, partnerId);
            const detail = await getDeceasedProfileDetail(deceasedProfileId);
            return NextResponse.json({ ok: true, detail });
        }

        if (action === 'update_profile' || action === 'patch_profile') {
            const detail = await updateDeceasedProfileFull(deceasedProfileId, {
                firstName: body.firstName,
                lastName: body.lastName,
                fullName: body.fullName,
                birthDate: body.birthDate,
                deathDate: body.deathDate,
                phone: body.phone,
                city: body.city ?? body.cemeteryCity,
                cemeteryName: body.cemeteryName,
                cemeteryCity: body.cemeteryCity ?? body.city,
                graveSector: body.graveSector,
                graveNumber: body.graveNumber,
                gravePosition: body.gravePosition,
                photoUrl: body.photoUrl,
                coverUrl: body.coverUrl,
                verifiedNotes: body.verifiedNotes,
                partnerId: body.partnerId,
                plannedDeliveryDates: body.plannedDeliveryDates,
            });
            return NextResponse.json({ ok: true, detail, message: 'Profilo aggiornato con successo' });
        }

        return NextResponse.json({ ok: false, error: 'Azione non supportata.' }, { status: 400 });
    } catch (error) {
        console.error('[deceased UPDATE]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}

export async function deceasedPutById(request: Request, context: IdContext) {
    return deceasedUpdateById(request, context);
}

export async function deceasedPatchById(request: Request, context: IdContext) {
    return deceasedUpdateById(request, context);
}

export async function deceasedDeleteById(_request: Request, context: IdContext) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id: deceasedProfileId } = await context.params;
        await deleteDeceasedProfileSafe(deceasedProfileId);
        return NextResponse.json({ ok: true, message: 'Profilo eliminato' });
    } catch (error) {
        console.error('[deceased DELETE]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}

export async function deceasedPostById(request: Request, context: IdContext) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id: deceasedProfileId } = await context.params;
        const body = await request.json();
        const action = String(body.action || '').trim();

        if (action === 'link_user') {
            const userId = String(body.userId || '').trim();
            if (!userId) {
                return NextResponse.json({ ok: false, error: 'userId mancante.' }, { status: 400 });
            }
            const detail = await linkUserToDeceased({
                deceasedProfileId,
                userId,
                relationship: body.relationship ?? null,
            });
            return NextResponse.json({ ok: true, detail, message: 'Utente collegato al profilo' });
        }

        if (action === 'link_order' || action === 'link_flowers') {
            const orderId = String(body.orderId || '').trim();
            if (!orderId) {
                return NextResponse.json({ ok: false, error: 'orderId mancante.' }, { status: 400 });
            }
            const detail = await linkOrderToDeceased({ deceasedProfileId, orderId });
            return NextResponse.json({
                ok: true,
                detail,
                message: 'Ordine / omaggio collegato al profilo',
            });
        }

        return NextResponse.json({ ok: false, error: 'Azione POST non supportata.' }, { status: 400 });
    } catch (error) {
        console.error('[deceased POST id]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}
