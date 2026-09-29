/**
 * Applica Order.paid_at su un DATABASE_URL esplicito (Production / branch).
 * Idempotente (ADD COLUMN IF NOT EXISTS).
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx scripts/apply-order-paid-at-migration.ts
 */
import { PrismaClient } from '@prisma/client';

function hostOf(url: string): string {
    return url.match(/@([^/]+)/)?.[1] || '?';
}

async function main() {
    const url = process.env.DATABASE_URL || '';
    if (!url) throw new Error('DATABASE_URL required');
    const host = hostOf(url);
    console.log('[apply-order-paid-at] DB', host);

    const prisma = new PrismaClient();
    try {
        await prisma.$executeRawUnsafe(
            `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3)`
        );
        await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "Order_paid_at_idx" ON "Order"("paid_at")`
        );
        // Registra migrazione in _prisma_migrations se assente (best-effort).
        const name = '20260929115000_order_paid_at';
        const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
            name
        ).catch(() => [] as Array<{ id: string }>);
        if (!existing.length) {
            await prisma.$executeRawUnsafe(
                `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
                 VALUES (gen_random_uuid()::text, 'manual-apply-order-paid-at', NOW(), $1, NULL, NULL, NOW(), 1)`,
                name
            ).catch((e: Error) => {
                console.warn('[apply-order-paid-at] _prisma_migrations insert skipped:', e.message);
            });
        }
        console.log('[apply-order-paid-at] OK');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
