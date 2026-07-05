import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { searchMessagingContacts } from '@/lib/whatsapp/contactSearch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
        return NextResponse.json({ success: true, results: [] });
    }

    try {
        const results = await searchMessagingContacts(q, 20);
        return NextResponse.json({ success: true, results });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Ricerca contatti non riuscita.';
        console.error('[communications/contacts GET]', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
