import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import type { MessagingContactType } from '@/lib/whatsapp/contactSearch';
import { getLastOrderNumberForContact } from '@/lib/whatsapp/lastOrderForContact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseContactType(raw: string | null): MessagingContactType | null {
    if (raw === 'UTENTE' || raw === 'FLORIST') return raw;
    return null;
}

export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const type = parseContactType(request.nextUrl.searchParams.get('type'));
    const id = request.nextUrl.searchParams.get('id')?.trim() ?? '';

    if (!type || !id) {
        return NextResponse.json(
            { success: false, error: 'Parametri type e id obbligatori.' },
            { status: 400 }
        );
    }

    try {
        const orderNumber = await getLastOrderNumberForContact(type, id);
        return NextResponse.json({ success: true, orderNumber });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Recupero ordine non riuscito.';
        console.error('[communications/contacts/last-order GET]', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
