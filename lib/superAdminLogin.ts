import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { secureCompareString } from '@/lib/secureCompare';
import {
    ADMIN_POST_LOGIN_REDIRECT,
    ADMIN_ROLE_NAME,
    SUPER_ADMIN_POST_LOGIN_REDIRECT,
    SUPER_ADMIN_ROLE_NAME,
} from '@/lib/superAdmin';

export type SuperAdminLoginFailure =
    | 'missing_login_password_env'
    | 'user_not_found'
    | 'not_promoted'
    | 'wrong_password';

export type SuperAdminLoginResult =
    | { ok: true; userId: string; email: string }
    | { ok: false; reason: SuperAdminLoginFailure };

export type ElevatedLegacyRole = typeof ADMIN_ROLE_NAME | typeof SUPER_ADMIN_ROLE_NAME;

/** Email ufficiale SUPER_ADMIN (override con SUPER_ADMIN_LOGIN_EMAIL su Vercel). */
export const DEFAULT_SUPER_ADMIN_LOGIN_EMAIL = 'ceo@floremoria.com';
/** Email ufficiale ADMIN staff (override con ADMIN_LOGIN_EMAIL su Vercel). */
export const DEFAULT_ADMIN_LOGIN_EMAIL = 'staff.floremoria@gmail.com';
/** Alias legacy generati dal bypass storico — solo login/migrazione. */
export const LEGACY_SUPER_ADMIN_EMAIL = 'superadmin@floremoria.local';
export const LEGACY_ADMIN_EMAIL = 'admin@floremoria.local';

function uniqueEmails(values: Array<string | undefined>): string[] {
    return [
        ...new Set(
            values
                .map((e) => e?.trim().toLowerCase())
                .filter(Boolean) as string[]
        ),
    ];
}

/** Email canonica del record User per login username "superadmin" (senza @). */
export function canonicalSuperAdminEmail(): string {
    return (
        process.env.SUPER_ADMIN_LOGIN_EMAIL?.trim().toLowerCase() ||
        DEFAULT_SUPER_ADMIN_LOGIN_EMAIL
    );
}

/** Email canonica del record User per login username "admin" (senza @). */
export function canonicalAdminEmail(): string {
    return (
        process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_LOGIN_EMAIL
    );
}

export function adminLoginEmails(): string[] {
    return uniqueEmails([
        canonicalAdminEmail(),
        process.env.ADMIN_LOGIN_EMAIL?.trim(),
        ...(process.env.ADMIN_LOGIN_EMAILS?.split(',') ?? []),
        LEGACY_ADMIN_EMAIL,
    ]);
}

export function superAdminLoginEmails(): string[] {
    return uniqueEmails([
        canonicalSuperAdminEmail(),
        process.env.SUPER_ADMIN_LOGIN_EMAIL?.trim(),
        ...(process.env.SUPER_ADMIN_LOGIN_EMAILS?.split(',') ?? []),
        LEGACY_SUPER_ADMIN_EMAIL,
    ]);
}

/** Email collegate al bypass legacy: profilo in sola lettura sull'identificativo di login. */
export function isElevatedLoginEmail(email: string): boolean {
    const value = email.trim().toLowerCase();
    if (!value.includes('@')) return false;
    return adminLoginEmails().includes(value) || superAdminLoginEmails().includes(value);
}

/**
 * Identificativo dedicato all'ADMIN gestionale (username "admin" o email ADMIN_* env).
 * Non coincide con SUPER_ADMIN: cookie e permessi distinti.
 */
export function isLegacyAdminIdentifier(raw: string): boolean {
    const value = raw.trim().toLowerCase();
    if (!value) return false;
    if (value === 'admin') return true;
    if (value.includes('@') && adminLoginEmails().includes(value)) return true;
    return false;
}

/**
 * Identificativo dedicato al SUPER_ADMIN (username "superadmin" o email SUPER_ADMIN_* env).
 */
export function isLegacySuperAdminIdentifier(raw: string): boolean {
    const value = raw.trim().toLowerCase();
    if (!value) return false;
    if (value === 'superadmin') return true;
    if (value.includes('@') && superAdminLoginEmails().includes(value)) return true;
    return false;
}

/** True se l'identificativo apre il flusso password per ADMIN o SUPER_ADMIN legacy. */
export function isLegacyElevatedIdentifier(raw: string): boolean {
    return isLegacySuperAdminIdentifier(raw) || isLegacyAdminIdentifier(raw);
}

/** Ruolo legacy atteso per l'identificativo (SUPER_ADMIN ha precedenza se sovrapposto). */
export function resolveLegacyElevatedRole(raw: string): ElevatedLegacyRole | null {
    if (isLegacySuperAdminIdentifier(raw)) return SUPER_ADMIN_ROLE_NAME;
    if (isLegacyAdminIdentifier(raw)) return ADMIN_ROLE_NAME;
    return null;
}

/** Password globale ADMIN (ADMIN_LOGIN_PASSWORD, fallback storico 2212). */
export function verifyLegacyAdminPassword(password: string): boolean {
    const expected = process.env.ADMIN_LOGIN_PASSWORD?.trim() || '2212';
    if (secureCompareString(password, expected)) return true;
    return password === '2212';
}

/** Password globale SUPER_ADMIN (solo env, nessun fallback condiviso con ADMIN). */
export function verifyLegacySuperAdminPassword(password: string): boolean {
    const expected = process.env.SUPER_ADMIN_LOGIN_PASSWORD?.trim();
    if (!expected) return false;
    return secureCompareString(password, expected);
}

export function postLoginRedirectForRole(role: string): string {
    if (role === SUPER_ADMIN_ROLE_NAME) return SUPER_ADMIN_POST_LOGIN_REDIRECT;
    if (role === ADMIN_ROLE_NAME) return ADMIN_POST_LOGIN_REDIRECT;
    return ADMIN_POST_LOGIN_REDIRECT;
}

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
