/**
 * Fix una tantum: attiva isB2B per partner Annunci Funebri su Neon produzione.
 *
 * Uso:
 *   DATABASE_POSTGRES_URL='postgresql://…' npx tsx scratch/fix-partner-b2b.ts
 * oppure (se in .env.production.local):
 *   npm run db:neon:fix-partner-b2b
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PARTNER_ID = 'f067beff-e351-4484-81b2-5b16bdf27801';

function loadProductionDatabaseUrl(): string | null {
    for (const name of ['.env.production.local', '.env.vercel.production']) {
        const p = resolve(process.cwd(), name);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const i = t.indexOf('=');
            if (i === -1) continue;
            const key = t.slice(0, i).trim();
            if (!['DATABASE_POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_URL'].includes(key)) {
                continue;
            }
            if (process.env[key]) continue;
            let val = t.slice(i + 1).trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    }

    const url =
        process.env.DATABASE_POSTGRES_URL?.trim() ||
        process.env.DATABASE_URL_UNPOOLED?.trim() ||
        process.env.DATABASE_URL?.trim();

    if (!url || !/^postgres(ql)?:\/\//.test(url)) return null;
    const host = url.match(/@([^/:?]+)/)?.[1] ?? '';
    if (host === 'localhost' || host === '127.0.0.1') return null;
    return url;
}

async function main(): Promise<void> {
    const databaseUrl = loadProductionDatabaseUrl();
    if (!databaseUrl) {
        console.error(
            'Manca URL Neon produzione. Esegui:\n  DATABASE_POSTGRES_URL=\'postgresql://…\' npx tsx scratch/fix-partner-b2b.ts'
        );
        process.exit(1);
    }

    const host = databaseUrl.match(/@([^/:?]+)/)?.[1] ?? '(sconosciuto)';
    console.log(`→ Connessione Neon: ${host}`);

    const prisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
    });

    try {
        const before = await prisma.partner.findUnique({
            where: { id: PARTNER_ID },
            select: { id: true, shopName: true, isB2B: true, isActive: true, deletedAt: true },
        });

        if (!before) {
            console.error(`Partner non trovato: ${PARTNER_ID}`);
            process.exit(1);
        }

        console.log('Prima:', before);

        const after = await prisma.partner.update({
            where: { id: PARTNER_ID },
            data: { isB2B: true },
            select: { id: true, shopName: true, isB2B: true, isActive: true, updatedAt: true },
        });

        console.log('Dopo:', after);
        console.log(`✓ isB2B=true confermato per "${after.shopName}" (${after.id})`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
