/**
 * Riclassifica bonifico PayPal Europe €500 (05/09/2026) come giroconto Fineco→PayPal.
 * Stessa natura dell’SDD Fineco→PayPal: TRASFERIMENTO_INTERNO, non costo fiorista.
 * Scollega qualsiasi attribuzione partner (Floragarden Stinga = falso positivo ALDO⊂SALDO).
 */
import prisma from '@/lib/prisma';

const BANK_LINE_ID = 'cmtq83vdw0001ld04ixwfktv0';

async function main() {
    const line = await prisma.bankStatementLine.findUnique({ where: { id: BANK_LINE_ID } });
    if (!line) throw new Error(`Bank line ${BANK_LINE_ID} not found`);

    const before = {
        matchType: line.matchType,
        matchStatus: line.matchStatus,
        matchNotes: line.matchNotes,
        matchedOrderId: line.matchedOrderId,
        amountCents: line.amountCents,
        desc: line.description.slice(0, 120),
    };

    if (Math.abs(line.amountCents) !== 50000) {
        throw new Error(`Unexpected amount ${line.amountCents}, expected ±50000`);
    }

    if (line.matchType === 'INTERNAL_TRANSFER') {
        console.log(JSON.stringify({ ok: true, alreadyDone: true, before }, null, 2));
        await prisma.$disconnect();
        return;
    }

    const raw =
        line.rawJson && typeof line.rawJson === 'object'
            ? { ...(line.rawJson as Record<string, unknown>) }
            : {};
    delete raw.floristMissingInvoice;
    delete raw.matchedPartnerId;
    delete raw.matchedPartnerName;
    raw.giroconto = true;
    raw.girocontoKind = 'FINECO_TO_PAYPAL_BALANCE';
    raw.correctedAt = new Date().toISOString();
    raw.correctedReason =
        'Bonifico Fineco→PayPal Europe €500 — conto di transito, non COSTI_FIORISTI (falso positivo Floragarden/Aldo⊂Saldo)';

    await prisma.bankStatementLine.update({
        where: { id: BANK_LINE_ID },
        data: {
            matchType: 'INTERNAL_TRANSFER',
            matchStatus: 'MATCHED',
            matchNotes:
                'Giroconto Fineco→wallet PayPal Europe €500 (05/09/2026). Stessa natura SDD Add To Balance. Non costo fiorista; partner scollegato.',
            matchedOrderId: null,
            rawJson: raw,
        },
    });

    const ledgerUpdates = await prisma.financialLedgerEntry.updateMany({
        where: {
            reversedAt: null,
            OR: [{ sourceKey: { contains: BANK_LINE_ID } }, { sourceId: BANK_LINE_ID }],
            category: { not: 'TRASFERIMENTO_INTERNO' },
        },
        data: { category: 'TRASFERIMENTO_INTERNO' },
    });

    const afterLedger = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [{ sourceKey: { contains: BANK_LINE_ID } }, { sourceId: BANK_LINE_ID }],
        },
        select: { id: true, sourceKey: true, category: true, totalCents: true },
    });

    const after = await prisma.bankStatementLine.findUnique({
        where: { id: BANK_LINE_ID },
        select: { matchType: true, matchStatus: true, matchNotes: true, matchedOrderId: true },
    });

    console.log(
        JSON.stringify({ ok: true, before, after, ledgerRowsUpdated: ledgerUpdates.count, afterLedger }, null, 2)
    );
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
