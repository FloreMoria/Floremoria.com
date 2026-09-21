import prisma from '@/lib/prisma';

async function main() {
    const exp = await prisma.manualFinanceExpense.findMany({
        where: {
            OR: [
                { vendorName: { contains: 'DC STUDIO', mode: 'insensitive' } },
                { totalCents: { in: [377430, -377430] } },
                { matchedStatementLineId: 'cmt311c5f000sl4041s82u7pg' },
            ],
        },
        select: {
            id: true,
            vendorName: true,
            totalCents: true,
            expenseDate: true,
            docType: true,
            description: true,
            metadataJson: true,
            matchedStatementLineId: true,
            periodKey: true,
            notes: true,
        },
        take: 10,
    });
    console.log('EXP', JSON.stringify(exp, null, 2));

    const ledger = await prisma.financialLedgerEntry.findMany({
        where: {
            OR: [
                { sourceId: 'cmt311c5f000sl4041s82u7pg' },
                { sourceKey: { contains: 'cmt311c5f000sl4041s82u7pg' } },
                { description: { contains: 'Dc Studio', mode: 'insensitive' } },
                { AND: [{ totalCents: { in: [377430, -377430] } }, { fiscalYear: 2026 }] },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            category: true,
            direction: true,
            totalCents: true,
            description: true,
            counterpartyName: true,
            accountingDate: true,
            reversedAt: true,
        },
        take: 20,
    });
    console.log('LEDGER', JSON.stringify(ledger, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
