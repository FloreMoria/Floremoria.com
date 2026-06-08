/**
 * Una tantum: sostituisce le email .local del bypass con quelle ufficiali del brand.
 *
 * Uso (Neon prod):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/migrate-elevated-user-emails.ts
 *
 * Idempotente: se la migrazione è già avvenuta, non modifica nulla.
 */
import { UserRole } from '@prisma/client';
import { loadEnvFiles, printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';

loadEnvFiles();

import prisma from '../lib/prisma';
import {
    DEFAULT_ADMIN_LOGIN_EMAIL,
    DEFAULT_SUPER_ADMIN_LOGIN_EMAIL,
    LEGACY_ADMIN_EMAIL,
    LEGACY_SUPER_ADMIN_EMAIL,
} from '../lib/superAdminLogin';
import { ADMIN_ROLE_NAME, SUPER_ADMIN_ROLE_NAME } from '../lib/superAdmin';

type MigrationRow = {
    from: string;
    to: string;
    systemRole: UserRole;
    roleName: typeof ADMIN_ROLE_NAME | typeof SUPER_ADMIN_ROLE_NAME;
};

const MIGRATIONS: MigrationRow[] = [
    {
        from: LEGACY_SUPER_ADMIN_EMAIL,
        to: DEFAULT_SUPER_ADMIN_LOGIN_EMAIL,
        systemRole: UserRole.SUPER_ADMIN,
        roleName: SUPER_ADMIN_ROLE_NAME,
    },
    {
        from: LEGACY_ADMIN_EMAIL,
        to: DEFAULT_ADMIN_LOGIN_EMAIL,
        systemRole: UserRole.ADMIN,
        roleName: ADMIN_ROLE_NAME,
    },
];

async function migrateOne(row: MigrationRow): Promise<void> {
    const from = row.from.toLowerCase();
    const to = row.to.toLowerCase();

    const [legacyUser, targetUser] = await Promise.all([
        prisma.user.findUnique({ where: { email: from } }),
        prisma.user.findUnique({ where: { email: to } }),
    ]);

    if (!legacyUser) {
        if (targetUser) {
            console.log(`✓ ${from} → già assente; target ${to} presente (id ${targetUser.id})`);
            return;
        }
        console.log(`– ${from} → nessun record legacy da migrare`);
        return;
    }

    const role = await prisma.role.findUnique({ where: { name: row.roleName } });

    if (!targetUser) {
        await prisma.user.update({
            where: { id: legacyUser.id },
            data: { email: to },
        });
        console.log(`✓ ${from} → ${to} (rename id ${legacyUser.id})`);
        return;
    }

    // Entrambi presenti: conserva il target ufficiale, unisce profilo e rimuove il legacy.
    await prisma.user.update({
        where: { id: targetUser.id },
        data: {
            systemRole: row.systemRole,
            isActive: true,
            roleId: targetUser.roleId ?? role?.id ?? legacyUser.roleId ?? null,
            roleExpiresAt: null,
            name: targetUser.name || legacyUser.name,
            phone: targetUser.phone || legacyUser.phone,
            company: targetUser.company || legacyUser.company,
            vatNumber: targetUser.vatNumber || legacyUser.vatNumber,
            lastLoginAt: targetUser.lastLoginAt ?? legacyUser.lastLoginAt,
        },
    });

    await prisma.user.delete({ where: { id: legacyUser.id } });
    console.log(
        `✓ ${from} (id ${legacyUser.id}) unito in ${to} (id ${targetUser.id}); legacy eliminato`
    );
}

async function main() {
    if (!process.env.DATABASE_URL?.trim()) {
        console.error('DATABASE_URL mancante.');
        process.exit(1);
    }

    console.log('→ Migrazione email utenti elevati (bypass legacy → brand ufficiale)\n');

    for (const row of MIGRATIONS) {
        await migrateOne(row);
    }

    console.log('\n→ Stato finale:');
    for (const row of MIGRATIONS) {
        const user = await prisma.user.findUnique({ where: { email: row.to.toLowerCase() } });
        if (user) {
            console.log(
                `  ${row.to}: id=${user.id}, systemRole=${user.systemRole}, name=${user.name ?? '—'}`
            );
        } else {
            console.log(`  ${row.to}: assente (verrà creato al prossimo login bypass)`);
        }
    }
}

main()
    .catch((err) => {
        console.error('Errore migrazione:', err);
        printDatabaseReachabilityHelp();
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
