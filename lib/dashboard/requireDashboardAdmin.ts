import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isDashboardAdminRole } from '@/lib/superAdmin';

export async function requireDashboardAdmin(): Promise<
    { ok: true; role: string } | { ok: false; response: NextResponse }
> {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('fm_user_role')?.value;
        if (!isDashboardAdminRole(role)) {
            return {
                ok: false,
                response: NextResponse.json({ ok: false, error: 'Non autorizzato.' }, { status: 403 }),
            };
        }
        return { ok: true, role: role! };
    } catch (error) {
        console.error('[requireDashboardAdmin] Error reading admin session:', error);
        return {
            ok: false,
            response: NextResponse.json({ ok: false, error: 'Errore durante la verifica dell\'autorizzazione.' }, { status: 500 }),
        };
    }
}
