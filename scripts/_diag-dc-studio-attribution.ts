/**
 * Diagnosi sola lettura: bonifico DC Studio €3774,30.
 */
import prisma from '@/lib/prisma';
import { readFloristAlertMeta } from '@/lib/financial/floristMissingInvoices';

async function main() {
    const lines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { amountCents: -377430 },
                { description: { contains: 'Dc Studio', mode: 'insensitive' } },
                { description: { contains: 'Studio Stp', mode: 'insensitive' } },
                { description: { contains: 'Proforma N. 158', mode: 'insensitive' } },
            ],
        },
        take: 10,
    });

    for (const line of lines) {
        const alert = readFloristAlertMeta(line.rawJson);
        console.log(
            JSON.stringify(
                {
                    id: line.id,
                    amountCents: line.amountCents,
                    accountingDate: line.accountingDate,
                    description: line.description,
                    matchType: line.matchType,
                    matchStatus: line.matchStatus,
                    matchScore: line.matchScore,
                    matchNotes: line.matchNotes,
                    matchedOrderId: line.matchedOrderId,
                    documentId: line.documentId,
                    categoryHint: (line as { category?: string }).category,
                    alert,
                    rawJson: line.rawJson,
                },
                null,
                2
            )
        );
    }

    const margherita = await prisma.partner.findMany({
        where: {
            OR: [
                { shopName: { contains: 'Margherita', mode: 'insensitive' } },
                { ownerName: { contains: 'Margherita', mode: 'insensitive' } },
            ],
            deletedAt: null,
        },
        select: { id: true, shopName: true, ownerName: true, vatNumber: true },
    });
    console.log('PARTNERS_MARGHERITA', margherita);

    // Expense DC Studio
    const exp = await prisma.manualFinanceExpense.findMany({
        where: {
            OR: [
                { vendorName: { contains: 'DC STUDIO', mode: 'insensitive' } },
                { vendorName: { contains: 'Dc Studio', mode: 'insensitive' } },
                { totalCents: { in: [377430, -377430] } },
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
            category: true as never,
        },
        take: 10,
    });
    console.log('EXPENSES', JSON.stringify(exp, null, 2));

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
