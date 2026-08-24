/**
 * One-shot: sanitizza anomalie Prima Nota (partita doppia PayPal/Stripe).
 * Uso: npx tsx --tsconfig tsconfig.json scripts/sanitize-ledger-double-entry.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
    const { sanitizeLedgerDoubleEntryAnomalies } = await import(
        '../lib/financial/ledgerDoubleEntrySanitize'
    );
    const prisma = (await import('../lib/prisma')).default;

    const result = await sanitizeLedgerDoubleEntryAnomalies();
    console.log('sanitize result:', JSON.stringify(result, null, 2));

    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            accountingDate: { gte: new Date('2026-08-24'), lt: new Date('2026-08-25') },
        },
        select: {
            sourceKey: true,
            category: true,
            totalCents: true,
            reversedAt: true,
            description: true,
            metadataJson: true,
        },
        orderBy: { totalCents: 'asc' },
    });

    for (const r of rows) {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        console.log(
            [
                r.reversedAt ? 'REV' : 'OK ',
                r.sourceKey,
                r.category,
                r.totalCents,
                meta.dareAccount || '-',
                meta.avereAccount || '-',
                (r.description || '').slice(0, 40),
            ].join(' | ')
        );
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    process.exit(1);
});
