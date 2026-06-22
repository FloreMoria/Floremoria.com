import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    addEmailToBlacklist,
    listEmailBlacklist,
    removeEmailFromBlacklist,
} from '@/lib/postman/emailBlacklist';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const entries = await listEmailBlacklist();
    return NextResponse.json({ ok: true, entries });
}

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    let body: { email?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: 'Body JSON non valido.' }, { status: 400 });
    }

    const raw = body.email?.trim();
    if (!raw) {
        return NextResponse.json({ ok: false, error: 'Indirizzo email obbligatorio.' }, { status: 400 });
    }

    try {
        const entry = await addEmailToBlacklist(raw);
        return NextResponse.json({ ok: true, entry });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Errore durante il salvataggio.';
        return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
}

export async function DELETE(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    if (!id) {
        return NextResponse.json({ ok: false, error: 'Parametro id mancante.' }, { status: 400 });
    }

    const removed = await removeEmailFromBlacklist(id);
    if (!removed) {
        return NextResponse.json({ ok: false, error: 'Voce non trovata.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
}
