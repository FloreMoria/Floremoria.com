/**
 * Diagnostica schema DB produzione/staging per i crash dashboard.
 * Uso: DATABASE_URL="postgresql://..." npm run db:check-dashboard
 */
import { PrismaClient } from '@prisma/client';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
    console.error('Manca DATABASE_URL');
    process.exit(1);
}

const host = url.match(/@([^/:]+)/)?.[1] ?? '(sconosciuto)';
console.log(`Host DB: ${host}\n`);

const prisma = new PrismaClient();

type Check = { label: string; ok: boolean; detail: string };

async function main(): Promise<void> {
    const checks: Check[] = [];

    async function probe(label: string, fn: () => Promise<unknown>): Promise<void> {
        try {
            await fn();
            checks.push({ label, ok: true, detail: 'OK' });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            checks.push({ label, ok: false, detail });
        }
    }

    await probe('Order.findMany (dashboard ordini)', () =>
        prisma.order.findMany({ take: 1, select: { id: true, proofFotoCode: true, agencyName: true } })
    );
    await probe('FloremoriaLog.findMany (overview)', () =>
        prisma.floremoriaLog.findMany({ take: 1 })
    );
    await probe('Partner.findMany (fioristi)', () =>
        prisma.partner.findMany({ take: 1, where: { deletedAt: null } })
    );
    await probe('PartnerApiCredential.findMany (B2B)', () =>
        prisma.partnerApiCredential.findMany({ take: 1 })
    );
    await probe('User.systemRole ADMIN upsert probe', async () => {
        const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'UserRole'
            ORDER BY e.enumsortorder
        `;
        const labels = rows.map((r) => r.enumlabel);
        if (!labels.includes('ADMIN')) {
            throw new Error(`UserRole enum manca ADMIN. Valori: ${labels.join(', ')}`);
        }
        if (!labels.includes('SUPER_ADMIN')) {
            throw new Error(`UserRole enum manca SUPER_ADMIN. Valori: ${labels.join(', ')}`);
        }
    });

    await probe('Ordini visibili in dashboard (filtro pagamento)', async () => {
        const [total, visible] = await Promise.all([
            prisma.order.count({ where: { deletedAt: null } }),
            prisma.order.count({
                where: {
                    deletedAt: null,
                    status: { not: 'CANCELLED' },
                    NOT: { status: 'PENDING', partnerPaymentStatus: 'UNPAID' },
                },
            }),
        ]);
        if (total > 0 && visible === 0) {
            throw new Error(
                `${total} ordini in DB ma 0 visibili: probabile webhook Stripe non attivo (tutti PENDING/UNPAID)`
            );
        }
    });

    console.log('--- Risultati ---');
    for (const c of checks) {
        console.log(`${c.ok ? '✓' : '✗'} ${c.label}`);
        console.log(`  ${c.detail}\n`);
    }

    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) {
        console.log('→ Azione consigliata: npm run db:migrate:deploy (con DATABASE_URL di produzione)');
        process.exit(1);
    }
    console.log('Schema dashboard: tutti i probe OK.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
