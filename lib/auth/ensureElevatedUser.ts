/**
 * Garantisce un record User persistente per accessi elevati (ADMIN / SUPER_ADMIN)
 * effettuati via bypass legacy, così profilo e operazioni DB non falliscono.
 */
import { User, UserRole } from '@prisma/client';
import prisma from '../prisma';
import { ensureSystemRoles } from '../ensureSystemRoles';
import { ADMIN_ROLE_NAME, SUPER_ADMIN_ROLE_NAME } from '../superAdmin';

type ElevatedSystemRole = typeof ADMIN_ROLE_NAME | typeof SUPER_ADMIN_ROLE_NAME;

export async function ensureElevatedUserRecord(
    email: string,
    systemRole: ElevatedSystemRole
): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
        throw new Error(`Email non valida per ensureElevatedUserRecord: ${email}`);
    }

    try {
        await ensureSystemRoles(prisma);
    } catch (roleError) {
        console.error('[ensureElevatedUserRecord] Warning: ensureSystemRoles failed:', roleError);
    }

    const roleName = systemRole === SUPER_ADMIN_ROLE_NAME ? SUPER_ADMIN_ROLE_NAME : ADMIN_ROLE_NAME;
    let role = null;
    try {
        role = await prisma.role.findUnique({ where: { name: roleName } });
    } catch (findRoleErr) {
        console.error('[ensureElevatedUserRecord] Warning: findUnique role failed:', findRoleErr);
    }

    const defaultName =
        systemRole === SUPER_ADMIN_ROLE_NAME
            ? 'Super Admin FloreMoria'
            : 'Amministratore FloreMoria';

    try {
        return await prisma.user.upsert({
            where: { email: normalizedEmail },
            update: {
                systemRole: systemRole as UserRole,
                isActive: true,
                ...(role?.id ? { roleId: role.id } : {}),
                roleExpiresAt: null,
                lastLoginAt: new Date(),
            },
            create: {
                email: normalizedEmail,
                name: normalizedEmail.split('@')[0] || defaultName,
                systemRole: systemRole as UserRole,
                isActive: true,
                roleId: role?.id ?? null,
            },
        });
    } catch (error) {
        console.error('[ensureElevatedUserRecord] Critical error during user upsert:', error);
        throw error;
    }
}
