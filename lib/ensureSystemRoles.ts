import type { PrismaClient } from '@prisma/client';
import { ROOT_ROLES } from '@/lib/rbac';
import { SUPER_ADMIN_PERMISSIONS, SUPER_ADMIN_ROLE_NAME } from '@/lib/superAdmin';

/** Garantisce i ruoli di sistema nel DB (seed / master-key). */
export async function ensureSystemRoles(prisma: PrismaClient): Promise<void> {
    await prisma.role.upsert({
        where: { name: SUPER_ADMIN_ROLE_NAME },
        update: { isSystem: true, permissions: SUPER_ADMIN_PERMISSIONS },
        create: {
            name: SUPER_ADMIN_ROLE_NAME,
            description: 'Super Admin — promozione solo via script master-key',
            isSystem: true,
            permissions: SUPER_ADMIN_PERMISSIONS,
        },
    });

    const operator = ROOT_ROLES.OPERATORE;
    await prisma.role.upsert({
        where: { name: operator.name },
        update: { isSystem: true, permissions: operator.permissions },
        create: {
            name: operator.name,
            isSystem: operator.isSystem,
            permissions: operator.permissions,
        },
    });
}
