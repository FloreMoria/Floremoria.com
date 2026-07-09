import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getVapidPublicKey } from '@/lib/push/staffPush';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const publicKey = getVapidPublicKey();
    if (!publicKey) {
        return NextResponse.json(
            { ok: false, error: 'VAPID non configurato (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).' },
            { status: 503 }
        );
    }

    return NextResponse.json({ ok: true, publicKey });
}
