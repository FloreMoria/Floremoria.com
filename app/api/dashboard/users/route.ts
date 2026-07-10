import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import { createDashboardManualUser } from '@/lib/users/createDashboardManualUser';

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = await request.json();
        const testModeActive = await getDashboardTestModeActive();
        const deceased = Array.isArray(body.deceased) ? body.deceased : [];

        const result = await createDashboardManualUser({
            name: body.name ?? null,
            email: body.email ?? null,
            phone: body.phone ?? null,
            isTest: testModeActive,
            deceased: deceased.map((row: Record<string, unknown>) => ({
                fullName: String(row.fullName || ''),
                cemeteryCity: String(row.cemeteryCity || ''),
                cemeteryName: row.cemeteryName != null ? String(row.cemeteryName) : null,
                verifiedNotes: row.verifiedNotes != null ? String(row.verifiedNotes) : null,
                partnerId: row.partnerId != null ? String(row.partnerId) : null,
            })),
        });

        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error('[dashboard/users POST]', error);
        const message = error instanceof Error ? error.message : 'Creazione utente non riuscita.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}
