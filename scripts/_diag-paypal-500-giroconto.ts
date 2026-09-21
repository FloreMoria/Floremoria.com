/**
 * Diagnosi + fix PayPal Europe €500 del 05/09/2026.
 */
import prisma from '@/lib/prisma';
import { readFloristAlertMeta } from '@/lib/financial/floristMissingInvoices';

async function main() {
    const lines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { amountCents: -50000 },
                { description: { contains: 'PayPal', mode: 'insensitive' } },
            ],
            AND: [
                {
                    OR: [
                        { accountingDate: { gte: new Date('2026-09-04'), lte: new Date('2026-09-06') } },
                        { valueDate: { gte: new Date('2026-09-04'), lte: new Date('2026-09-06') } },
                    ],
                },
            ],
        },
        take: 20,
    });

    // Also search more loosely
    const loose = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: -50000,
            OR: [
                { accountingDate: { gte: new Date('2026-09-01'), lte: new Date('2026-09-10') } },
                { valueDate: { gte: new Date('2026-09-01'), lte: new Date('2026-09-10') } },
            ],
        },
        take: 20,
    });

    console.log(
        'LINES',
        JSON.stringify(
            [...lines, ...loose].map((l) => ({
                id: l.id,
                amt: l.amountCents,
                date: l.accountingDate || l.valueDate,
                matchType: l.matchType,
                matchStatus: l.matchStatus,
                matchNotes: l.matchNotes,
                matchedOrderId: l.matchedOrderId,
                desc: l.description.slice(0, 200),
                alert: readFloristAlertMeta(l.rawJson),
            })),
            null,
            2
        )
    );

    const ids = [...new Set([...lines, ...loose].map((l) => l.id))];
    const ledger = await prisma.financialLedgerEntry.findMany({
        where: {
            OR: [
                { sourceId: { in: ids } },
                { sourceKey: { in: ids.map((id) => `BANK_LINE:${id}`) } },
                {
                    AND: [
                        { totalCents: { in: [-50000, 50000] } },
                        { accountingDate: { gte: new Date('2026-09-01'), lte: new Date('2026-09-10') } },
                        { description: { contains: 'PayPal', mode: 'insensitive' } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            category: true,
            totalCents: true,
            description: true,
            reversedAt: true,
            accountingDate: true,
        },
        take: 30,
    });
    console.log('LEDGER', JSON.stringify(ledger, null, 2));

    // Reference: SDD Fineco→PayPal 1655.95
    const sdd = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { amountCents: -165595 },
                { amountCents: 165595 },
                { description: { contains: '1655', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            matchType: true,
            matchNotes: true,
            description: true,
            accountingDate: true,
        },
        take: 10,
    });
    console.log('SDD_REF', JSON.stringify(sdd, null, 2));

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
