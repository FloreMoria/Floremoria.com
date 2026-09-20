/**
 * Correzione DC Studio €3.774,30: categoria CONSULENZE + link fattura↔bonifico.
 * Non tocca partner (nessun matchedPartnerId in schema; falso positivo solo runtime F3).
 */
import prisma from '@/lib/prisma';

const BANK_LINE_ID = 'cmt311c5f000sl4041s82u7pg';
const EXPENSE_ID = 'cmt2q4dvb0019jl04xfxs7wfj';

async function main() {
    const line = await prisma.bankStatementLine.findUnique({ where: { id: BANK_LINE_ID } });
    if (!line) throw new Error(`Bank line ${BANK_LINE_ID} not found`);

    const expense = await prisma.manualFinanceExpense.findUnique({ where: { id: EXPENSE_ID } });
    if (!expense) throw new Error(`Expense ${EXPENSE_ID} not found`);

    const before = {
        matchType: line.matchType,
        matchStatus: line.matchStatus,
        matchNotes: line.matchNotes,
        expenseMatchedLine: expense.matchedStatementLineId,
    };

    // Conferma SDI_INVOICE (fattura fornitore) + note esplicite consulenza
    await prisma.bankStatementLine.update({
        where: { id: BANK_LINE_ID },
        data: {
            matchType: 'SDI_INVOICE',
            matchStatus: 'MATCHED',
            matchNotes:
                'Consulenza professionale DC Studio STP SRL — proforma n.158 / fattura n.66 (TD06 parcella). Non costo fiorista.',
            matchedOrderId: null,
        },
    });

    const meta =
        expense.metadataJson && typeof expense.metadataJson === 'object'
            ? { ...(expense.metadataJson as Record<string, unknown>) }
            : {};
    meta.ledgerCategory = 'CONSULENZE';
    meta.professionalService = true;
    meta.linkedProforma = '158';
    meta.correctedAt = new Date().toISOString();
    meta.correctedReason = 'Riclassifica consulenza DC Studio (non fiorista)';

    await prisma.manualFinanceExpense.update({
        where: { id: EXPENSE_ID },
        data: {
            matchedStatementLineId: BANK_LINE_ID,
            metadataJson: meta,
            notes: [
                expense.notes || '',
                'CONSULENZE: parcella commercialista DC Studio STP SRL n.66 / proforma 158',
            ]
                .filter(Boolean)
                .join(' | '),
        },
    });

    // Ledger attivi: SPESE_OPERATIVE → CONSULENZE
    const ledgerUpdates = await prisma.financialLedgerEntry.updateMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: `BANK_LINE:${BANK_LINE_ID}` },
                { sourceKey: `MANUAL_EXPENSE:${EXPENSE_ID}` },
            ],
            category: { not: 'CONSULENZE' },
        },
        data: { category: 'CONSULENZE' },
    });

    const afterLedger = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: `BANK_LINE:${BANK_LINE_ID}` },
                { sourceKey: `MANUAL_EXPENSE:${EXPENSE_ID}` },
            ],
        },
        select: { sourceKey: true, category: true, totalCents: true, reversedAt: true },
    });

    console.log(
        JSON.stringify(
            {
                ok: true,
                before,
                ledgerRowsUpdated: ledgerUpdates.count,
                afterLedger,
                note: 'Partner Margherita non era in DB su questa riga: falso positivo solo in F3 via token STUDIO.',
            },
            null,
            2
        )
    );
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
