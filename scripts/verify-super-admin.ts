/**
 * Verifica stato Super Admin per un'email (diagnostica login).
 * Uso: npm run verify-super-admin -- email@esempio.it
 */
import { loadEnvFiles, printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';

loadEnvFiles();
import { PrismaClient, UserRole } from '@prisma/client';

async function main() {
    const email = process.argv[2]?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
        console.error('Uso: npm run verify-super-admin -- <email>');
        process.exit(1);
    }

    const prisma = new PrismaClient();
    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { role: true },
        });

        if (!user) {
            console.log(`❌ Nessun utente con email ${email}`);
            console.log('   → npm run master-key --', email, '"<SUPER_ADMIN_SETUP_TOKEN>"');
            process.exit(1);
        }

        console.log('Utente:', user.email);
        console.log('systemRole:', user.systemRole);
        console.log('roleId:', user.roleId ?? '(nessuno)');
        console.log('role.name:', user.role?.name ?? '(nessuno)');

        const elevated =
            user.systemRole === UserRole.SUPER_ADMIN || user.role?.name === 'SUPER_ADMIN';

        if (!elevated) {
            console.log('\n❌ Non promosso a Super Admin.');
            console.log('   → npm run master-key --', email, '"<SUPER_ADMIN_SETUP_TOKEN>"');
            process.exit(1);
        }

        const hasLoginEnv = Boolean(process.env.SUPER_ADMIN_LOGIN_PASSWORD?.trim());
        console.log('\n✅ Super Admin OK nel database.');
        console.log(
            hasLoginEnv
                ? '✅ SUPER_ADMIN_LOGIN_PASSWORD presente in .env'
                : '❌ SUPER_ADMIN_LOGIN_PASSWORD mancante in .env'
        );
        console.log('\nLogin: usa la email nel campo Identificativo e SUPER_ADMIN_LOGIN_PASSWORD (non il SETUP_TOKEN).');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    const msg = String(e);
    if (msg.includes("Can't reach database") || msg.includes('P1001')) {
        printDatabaseReachabilityHelp();
    } else {
        console.error(e);
    }
    process.exit(1);
});
