/**
 * Risoluzione utente di sessione da cookie httpOnly.
 * Allinea profilo e API al record creato da ensureElevatedUserRecord.
 */
import { cookies } from 'next/headers';
import { User, UserRole } from '@prisma/client';
import prisma from '../prisma';
import { ADMIN_ROLE_NAME, SUPER_ADMIN_ROLE_NAME } from '../superAdmin';
import { isElevatedLoginEmail } from '../superAdminLogin';
import { ensureElevatedUserRecord } from './ensureElevatedUser';

export interface SessionContext {
    role: string;
    email: string | null;
    user: User | null;
}

/** Email di bypass (legacy .local o ufficiali env): identificativo login non modificabile dal profilo. */
export function isBypassElevatedEmail(email: string): boolean {
    return isElevatedLoginEmail(email);
}

export function isElevatedDashboardRole(role: string): boolean {
    return role === ADMIN_ROLE_NAME || role === SUPER_ADMIN_ROLE_NAME;
}

/**
 * Carica l'utente corrente dalla sessione (fm_user_email + fm_user_role).
 * Per ADMIN/SUPER_ADMIN senza record, esegue ensureElevatedUserRecord.
 */
export async function resolveSessionUser(): Promise<SessionContext> {
    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value?.trim() || '';
    const email = cookieStore.get('fm_user_email')?.value?.trim().toLowerCase() || null;

    if (!email) {
        return { role, email: null, user: null };
    }

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user && isElevatedDashboardRole(role)) {
        user = await ensureElevatedUserRecord(
            email,
            role === SUPER_ADMIN_ROLE_NAME ? SUPER_ADMIN_ROLE_NAME : ADMIN_ROLE_NAME
        );
    }

    return { role, email, user };
}

/**
 * Costruisce il payload Prisma ammesso per l'aggiornamento profilo.
 * NON tocca mai: passwordHash, systemRole, roleId, email, isActive, token invito.
 * Le password di bypass (ADMIN_LOGIN_PASSWORD / SUPER_ADMIN_LOGIN_PASSWORD) restano
 * esclusivamente nelle variabili d'ambiente Vercel — mai scritte su User.
 */
export function buildSafeProfileUpdate(body: Record<string, unknown>): {
    name?: string;
    phone?: string | null;
    company?: string | null;
    vatNumber?: string | null;
} {
    const data: {
        name?: string;
        phone?: string | null;
        company?: string | null;
        vatNumber?: string | null;
    } = {};

    if (typeof body.name === 'string') {
        const name = body.name.trim();
        if (name) data.name = name.slice(0, 200);
    }
    if (typeof body.phone === 'string') {
        data.phone = body.phone.trim().slice(0, 40) || null;
    }
    if (typeof body.company === 'string') {
        data.company = body.company.trim().slice(0, 200) || null;
    }
    if (typeof body.vatNumber === 'string') {
        data.vatNumber = body.vatNumber.trim().slice(0, 20) || null;
    }

    return data;
}

/** Ruoli autorizzati a modificare il proprio profilo staff. */
export function canManageOwnProfile(role: string, user: User | null): boolean {
    if (!user) return false;
    if (isElevatedDashboardRole(role)) return true;
    const staffRoles: UserRole[] = [
        UserRole.OPERATOR,
        UserRole.FLORIST,
        UserRole.AGENCY,
        UserRole.ACCOUNTANT,
        UserRole.STAKEHOLDER,
        UserRole.USER,
    ];
    return staffRoles.includes(user.systemRole);
}
