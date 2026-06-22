import { PrismaClient } from '@prisma/client';

function databaseHostLabel(): string {
    const url =
        process.env.DATABASE_URL_UNPOOLED?.trim() ||
        process.env.DATABASE_URL?.trim() ||
        '';
    if (!url) return '(DATABASE_URL non impostata)';
    return url.match(/@([^/:?]+)/)?.[1] ?? '(host sconosciuto)';
}

async function main() {
    const host = databaseHostLabel();
    console.log(`→ Verifica phone_blacklist su: ${host}`);

    const prisma = new PrismaClient();
    try {
        const rows = await prisma.$queryRaw<{ tbl: string | null }[]>`
            SELECT to_regclass('public.phone_blacklist')::text AS tbl
        `;
        const tbl = rows?.[0]?.tbl;
        if (!tbl) {
            throw new Error('Tabella phone_blacklist assente. Eseguire: npx prisma migrate deploy');
        }
        await prisma.phoneBlacklist.count();
        console.log(`OK: tabella phone_blacklist presente (${tbl})`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
