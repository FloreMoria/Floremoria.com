import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
    deleteProofPhoto,
    replaceProofPhoto,
    rotateProofPhoto,
} from '@/lib/deliveryProof/manageProofPhoto';
import { isDashboardAdminRole } from '@/lib/superAdmin';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value;
    if (!isDashboardAdminRole(role)) {
        return {
            ok: false,
            response: NextResponse.json({ ok: false, error: 'Non autorizzato.' }, { status: 403 }),
        };
    }
    return { ok: true };
}

export async function POST(request: Request) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    try {
        const form = await request.formData();
        const action = String(form.get('action') || '').trim();
        const orderId = String(form.get('orderId') || '').trim();
        const url = String(form.get('url') || '').trim();

        if (!action || !orderId || !url) {
            return NextResponse.json({ ok: false, error: 'Parametri mancanti.' }, { status: 400 });
        }

        if (action === 'rotate') {
            const result = await rotateProofPhoto(orderId, url);
            return NextResponse.json(result, { status: result.ok ? 200 : 400 });
        }

        if (action === 'replace') {
            const file = form.get('file');
            if (!(file instanceof File) || file.size === 0) {
                return NextResponse.json({ ok: false, error: 'File non valido.' }, { status: 400 });
            }
            const result = await replaceProofPhoto(orderId, url, file);
            return NextResponse.json(result, { status: result.ok ? 200 : 400 });
        }

        if (action === 'delete') {
            const result = await deleteProofPhoto(orderId, url);
            return NextResponse.json(result, { status: result.ok ? 200 : 400 });
        }

        return NextResponse.json({ ok: false, error: 'Azione non supportata.' }, { status: 400 });
    } catch (error) {
        console.error('[delivery-proof/photo]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
