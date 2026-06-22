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
    if (host === 'localhost' || host === '127.0.0.1') {
        console.warn(
            `Attenzione: stai verificando il DB locale (${host}), non Neon produzione.\n` +
                `Usa: DATABASE_URL_UNPOOLED='postgresql://…@ep-….neon.tech/…' npx tsx scripts/verify-email-blacklist-table.ts\n`
        );
    } else {
        console.log(`→ Verifica su: ${host}`);
    }

    const prisma = new PrismaClient();
    try {
        // Prisma non deserializza il tipo PostgreSQL regclass: cast esplicito a text.
        const rows = await prisma.$queryRaw<{ tbl: string | null }[]>`
            SELECT to_regclass('public.email_blacklist')::text AS tbl
        `;
        const tbl = rows?.[0]?.tbl;
        if (!tbl) {
            throw new Error('Tabella email_blacklist assente. Eseguire: npx prisma migrate deploy');
        }

        await prisma.emailBlacklist.count();
        console.log(`OK: tabella email_blacklist presente (${tbl})`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
