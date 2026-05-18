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

    for (const key in ROOT_ROLES) {
        const role = ROOT_ROLES[key as keyof typeof ROOT_ROLES];
        await prisma.role.upsert({
            where: { name: role.name },
            update: { isSystem: true, permissions: role.permissions },
            create: {
                name: role.name,
                isSystem: role.isSystem,
                permissions: role.permissions,
            },
        });
    }
}
