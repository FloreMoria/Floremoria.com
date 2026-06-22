import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        const rows = await prisma.$queryRaw<{ tbl: string | null }[]>`
            SELECT to_regclass('public.email_blacklist') AS tbl
        `;
        const tbl = rows?.[0]?.tbl;
        if (!tbl) {
            throw new Error('Tabella email_blacklist assente dopo migrate deploy');
        }
        console.log('OK: tabella email_blacklist presente su Neon');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
