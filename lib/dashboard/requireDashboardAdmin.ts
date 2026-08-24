import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { findUserByEmail } from '@/lib/auth/identity';
import { isDashboardAdminRole } from '@/lib/superAdmin';

export type DashboardAdminSession = {
    ok: true;
    role: string;
    email: string;
    userId: string;
};

/**
 * Verifica sessione admin server-side (cookie + record User su Neon).
 * Perché: il solo cookie fm_user_role non è firmato e non è fonte di verità.
 */
export async function requireDashboardAdmin(): Promise<
    DashboardAdminSession | { ok: false; response: NextResponse }
> {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('fm_user_role')?.value?.trim() || '';
        const email = cookieStore.get('fm_user_email')?.value?.trim().toLowerCase() || '';
        const expiresRaw = cookieStore.get('fm_role_expires_at')?.value?.trim();

        if (!isDashboardAdminRole(role)) {
            return {
                ok: false,
                response: NextResponse.json({ ok: false, error: 'Non autorizzato.' }, { status: 403 }),
            };
        }

        if (!email || !email.includes('@')) {
            return {
                ok: false,
                response: NextResponse.json(
                    { ok: false, error: 'Sessione non valida: email mancante. Effettua di nuovo il login.' },
                    { status: 401 }
                ),
            };
        }

        if (expiresRaw) {
            const expiresAt = new Date(expiresRaw);
            if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
                return {
                    ok: false,
                    response: NextResponse.json(
                        { ok: false, error: 'Sessione scaduta. Effettua di nuovo il login.' },
                        { status: 401 }
                    ),
                };
            }
        }

        const user = await findUserByEmail(email);
        if (!user || user.deletedAt) {
            return {
                ok: false,
                response: NextResponse.json(
                    { ok: false, error: 'Sessione non valida: utente non trovato.' },
                    { status: 401 }
                ),
            };
        }

        if (user.isActive === false) {
            return {
                ok: false,
                response: NextResponse.json(
                    { ok: false, error: 'Account non attivo.' },
                    { status: 403 }
                ),
            };
        }

        if (user.roleExpiresAt && user.roleExpiresAt.getTime() <= Date.now()) {
            return {
                ok: false,
                response: NextResponse.json(
                    { ok: false, error: 'Ruolo temporaneo scaduto.' },
                    { status: 401 }
                ),
            };
        }

        const dbRole = String(user.systemRole || '');
        if (
            user.systemRole !== UserRole.ADMIN &&
            user.systemRole !== UserRole.SUPER_ADMIN &&
            !isDashboardAdminRole(dbRole)
        ) {
            return {
                ok: false,
                response: NextResponse.json(
                    { ok: false, error: 'Non autorizzato (ruolo DB insufficiente).' },
                    { status: 403 }
                ),
            };
        }

        return { ok: true, role, email: user.email, userId: user.id };
    } catch (error) {
        console.error('[requireDashboardAdmin] Error verifying admin session:', error);
        return {
            ok: false,
            response: NextResponse.json(
                { ok: false, error: "Errore durante la verifica dell'autorizzazione." },
                { status: 500 }
            ),
        };
    }
}
