import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { secureCompareString } from '@/lib/secureCompare';
import { SUPER_ADMIN_ROLE_NAME } from '@/lib/superAdmin';

export type SuperAdminLoginFailure =
    | 'missing_login_password_env'
    | 'user_not_found'
    | 'not_promoted'
    | 'wrong_password';

export type SuperAdminLoginResult =
    | { ok: true; userId: string; email: string }
    | { ok: false; reason: SuperAdminLoginFailure };

export async function verifySuperAdminCredentials(
    emailRaw: string,
    password: string
): Promise<SuperAdminLoginResult> {
    const expectedPassword = process.env.SUPER_ADMIN_LOGIN_PASSWORD?.trim();
    if (!expectedPassword) {
        return { ok: false, reason: 'missing_login_password_env' };
    }

    const email = emailRaw.trim().toLowerCase();
    if (!email.includes('@')) {
        return { ok: false, reason: 'user_not_found' };
    }

    const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true },
    });

    if (!user) {
        return { ok: false, reason: 'user_not_found' };
    }

    const isElevated =
        user.systemRole === UserRole.SUPER_ADMIN || user.role?.name === SUPER_ADMIN_ROLE_NAME;

    if (!isElevated) {
        return { ok: false, reason: 'not_promoted' };
    }

    if (!secureCompareString(password, expectedPassword)) {
        return { ok: false, reason: 'wrong_password' };
    }

    return { ok: true, userId: user.id, email: user.email };
}

const DEV_HINTS: Record<SuperAdminLoginFailure, string> = {
    missing_login_password_env:
        'SUPER_ADMIN_LOGIN_PASSWORD non è impostata nel server (.env.local o Vercel).',
    user_not_found: 'Nessun utente con questa email nel database. Esegui: npm run master-key -- <email> "<token>"',
    not_promoted:
        'Utente trovato ma non è Super Admin. Esegui master-key sullo stesso DATABASE_URL del server.',
    wrong_password: 'Password non coincide con SUPER_ADMIN_LOGIN_PASSWORD (non usare il SETUP_TOKEN).',
};

export function superAdminLoginDevHint(reason: SuperAdminLoginFailure): string | undefined {
    if (process.env.NODE_ENV !== 'development') return undefined;
    return DEV_HINTS[reason];
}
