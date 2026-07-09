import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    removeStaffPushSubscription,
    saveStaffPushSubscription,
} from '@/lib/push/staffPush';

export const dynamic = 'force-dynamic';

interface SubscribeBody {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
}

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    let body: SubscribeBody;
    try {
        body = (await request.json()) as SubscribeBody;
    } catch {
        return NextResponse.json({ ok: false, error: 'JSON non valido.' }, { status: 400 });
    }

    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const authKey = body.keys?.auth?.trim();

    if (!endpoint || !p256dh || !authKey) {
        return NextResponse.json(
            { ok: false, error: 'endpoint, keys.p256dh e keys.auth sono obbligatori.' },
            { status: 400 }
        );
    }

    await saveStaffPushSubscription({ endpoint, p256dh, auth: authKey });
    return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    let body: SubscribeBody;
    try {
        body = (await request.json()) as SubscribeBody;
    } catch {
        return NextResponse.json({ ok: false, error: 'JSON non valido.' }, { status: 400 });
    }

    const endpoint = body.endpoint?.trim();
    if (!endpoint) {
        return NextResponse.json({ ok: false, error: 'endpoint mancante.' }, { status: 400 });
    }

    await removeStaffPushSubscription(endpoint);
    return NextResponse.json({ ok: true });
}
