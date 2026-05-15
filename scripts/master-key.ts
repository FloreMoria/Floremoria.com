/**
 * Promozione offline a Super Admin — unico percorso consentito.
 * Uso: npm run master-key -- email@esempio.it <SUPER_ADMIN_SETUP_TOKEN>
 * Il token deve coincidere con SUPER_ADMIN_SETUP_TOKEN in .env (mai committare).
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();
import { PrismaClient, UserRole } from '@prisma/client';
import { ensureSystemRoles } from '../lib/ensureSystemRoles';
import { SUPER_ADMIN_ROLE_NAME } from '../lib/superAdmin';

function usage(): never {
    console.error('Uso: npm run master-key -- <email> <SUPER_ADMIN_SETUP_TOKEN>');
    console.error('Esempio: npm run master-key -- salvatore@floremoria.eu "il-tuo-token-segreto"');
    process.exit(1);
}

async function main() {
    const email = process.argv[2]?.trim().toLowerCase();
    const token = process.argv[3]?.trim();

    if (!email || !email.includes('@')) usage();
    if (!token) usage();

    const expected = process.env.SUPER_ADMIN_SETUP_TOKEN?.trim();
    if (!expected) {
        console.error('Errore: imposta SUPER_ADMIN_SETUP_TOKEN in .env o .env.local');
        process.exit(1);
    }

    if (token.length !== expected.length) {
        console.error('Errore: token non valido.');
        process.exit(1);
    }

    let match = 0;
    for (let i = 0; i < expected.length; i++) {
        match |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (match !== 0) {
        console.error('Errore: token non valido.');
        process.exit(1);
    }

    const prisma = new PrismaClient();

    try {
        await ensureSystemRoles(prisma);
        const superAdminRole = await prisma.role.findUniqueOrThrow({
            where: { name: SUPER_ADMIN_ROLE_NAME },
        });

        const user = await prisma.user.upsert({
            where: { email },
            update: {
                systemRole: UserRole.SUPER_ADMIN,
                roleId: superAdminRole.id,
                roleExpiresAt: null,
            },
            create: {
                email,
                name: email.split('@')[0] || 'Super Admin',
                systemRole: UserRole.SUPER_ADMIN,
                roleId: superAdminRole.id,
            },
        });

        console.log(`OK: ${user.email} promosso a SUPER_ADMIN (systemRole + Role).`);
        console.log('Accedi con email + SUPER_ADMIN_LOGIN_PASSWORD su /login, poi /admin-panel');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
