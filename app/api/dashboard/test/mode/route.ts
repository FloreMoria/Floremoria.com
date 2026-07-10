import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    DASHBOARD_TEST_MODE_COOKIE,
    DASHBOARD_TEST_MODE_MAX_AGE_SEC,
} from '@/lib/dashboard/testMode';

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    let enabled = false;
    try {
        const body = await request.json();
        enabled = Boolean(body.enabled);
    } catch {
        return NextResponse.json({ ok: false, error: 'Payload non valido.' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true, enabled });
    response.cookies.set(DASHBOARD_TEST_MODE_COOKIE, enabled ? '1' : '0', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: DASHBOARD_TEST_MODE_MAX_AGE_SEC,
    });

    return response;
}
