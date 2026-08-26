/**
 * Fascia di quadratura Contabilità — 3 controlli server-side su Neon.
 * Solo lettura aggregata: nessun truncate / delete.
 *
 * Saldo calcolato Fineco = saldo iniziale più antico del periodo + Σ movimenti,
 * oppure ultimo saldo finale di rendiconto se più recente.
 */

import prisma from '@/lib/prisma';
import { getFinecoManualBalance } from '@/lib/financial/finecoBalance';
import { countFloristWaitingDocuments } from '@/lib/financial/floristCompensationRegister';

export type FinanceQuadratura = {
    /** Saldo reale (manuale Fineco) in centesimi; null se non impostato. */
    realBalanceCents: number | null;
    realBalanceAlignedAt: string | null;
    /** Saldo calcolato da rendiconti (apertura + movimenti / chiusura). */
    calculatedBalanceCents: number;
    /** Apertura usata nel calcolo (centesimi). */
    openingBalanceCents: number | null;
    /** Ultima chiusura di rendiconto (centesimi). */
    statementClosingCents: number | null;
    /** Σ movimenti bancari nel periodo. */
    movementsSumCents: number;
    /** real − calculated (0 = quadrato). Null se manca il saldo reale. */
    balanceDiffCents: number | null;
    isBalanceSquared: boolean;
    /** Righe estratto Fineco non MATCHED (+ eventuali gateway ancora aperti sul ledger). */
    unmatchedTotal: number;
    unmatchedBankLines: number;
    missingDocuments: number;
};

/**
 * Aggrega differenza saldo, movimenti senza match e documenti mancanti.
 */
export async function computeFinanceQuadratura(): Promise<FinanceQuadratura> {
    const year = new Date().getFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const [manual, unmatchedBank, floristWaiting, docs, bankSumAgg] = await Promise.all([
        getFinecoManualBalance(),
        prisma.bankStatementLine.count({
            where: { matchStatus: { not: 'MATCHED' } },
        }),
        countFloristWaitingDocuments(),
        prisma.bankStatementDocument.findMany({
            where: {
                OR: [
                    { periodStart: { gte: yearStart, lt: yearEnd } },
                    { periodEnd: { gte: yearStart, lt: yearEnd } },
                    {
                        AND: [
                            { periodStart: null },
                            { uploadedAt: { gte: yearStart, lt: yearEnd } },
                        ],
                    },
                ],
                status: { in: ['PARSED', 'RECONCILED'] },
            },
            select: {
                id: true,
                fileName: true,
                periodStart: true,
                periodEnd: true,
                openingBalanceCents: true,
                closingBalanceCents: true,
            },
            orderBy: [{ periodStart: 'asc' }, { uploadedAt: 'asc' }],
        }),
        prisma.bankStatementLine.aggregate({
            where: {
                OR: [
                    { accountingDate: { gte: yearStart, lt: yearEnd } },
                    {
                        AND: [
                            { accountingDate: null },
                            { valueDate: { gte: yearStart, lt: yearEnd } },
                        ],
                    },
                ],
            },
            _sum: { amountCents: true },
        }),
    ]);

    const movementsSumCents = bankSumAgg._sum.amountCents || 0;

    // Apertura: primo rendiconto con openingBalance (tipicamente Q1 → saldo 1/1)
    const withOpening = docs
        .filter((d) => d.openingBalanceCents != null)
        .sort((a, b) => {
            const ta = a.periodStart?.getTime() ?? 0;
            const tb = b.periodStart?.getTime() ?? 0;
            return ta - tb;
        });
    const openingBalanceCents = withOpening[0]?.openingBalanceCents ?? null;

    // Chiusura più recente tra i rendiconti
    const withClosing = docs
        .filter((d) => d.closingBalanceCents != null)
        .sort((a, b) => {
            const ta = a.periodEnd?.getTime() ?? a.periodStart?.getTime() ?? 0;
            const tb = b.periodEnd?.getTime() ?? b.periodStart?.getTime() ?? 0;
            return tb - ta;
        });
    const statementClosingCents = withClosing[0]?.closingBalanceCents ?? null;
    const latestClosingEnd = withClosing[0]?.periodEnd ?? withClosing[0]?.periodStart ?? null;

    let calculatedBalanceCents = 0;
    if (openingBalanceCents != null) {
        // Libro: saldo iniziale anno + tutti i movimenti YTD importati
        calculatedBalanceCents = openingBalanceCents + movementsSumCents;

        // Se esiste una chiusura di rendiconto più “fidata” e successiva all’apertura,
        // e i movimenti dopo quella chiusura sono noti, preferisci:
        // chiusura + movimenti successivi alla periodEnd del doc di chiusura
        if (statementClosingCents != null && latestClosingEnd) {
            const afterClosing = await prisma.bankStatementLine.aggregate({
                where: {
                    OR: [
                        { accountingDate: { gt: latestClosingEnd, lt: yearEnd } },
                        {
                            AND: [
                                { accountingDate: null },
                                { valueDate: { gt: latestClosingEnd, lt: yearEnd } },
                            ],
                        },
                    ],
                },
                _sum: { amountCents: true },
            });
            const afterSum = afterClosing._sum.amountCents || 0;
            calculatedBalanceCents = statementClosingCents + afterSum;
        }
    } else if (statementClosingCents != null && latestClosingEnd) {
        const afterClosing = await prisma.bankStatementLine.aggregate({
            where: {
                OR: [
                    { accountingDate: { gt: latestClosingEnd, lt: yearEnd } },
                    {
                        AND: [
                            { accountingDate: null },
                            { valueDate: { gt: latestClosingEnd, lt: yearEnd } },
                        ],
                    },
                ],
            },
            _sum: { amountCents: true },
        });
        calculatedBalanceCents = statementClosingCents + (afterClosing._sum.amountCents || 0);
    } else {
        calculatedBalanceCents = movementsSumCents;
    }

    const realBalanceCents = manual?.balanceCents ?? null;
    const balanceDiffCents =
        realBalanceCents == null ? null : realBalanceCents - calculatedBalanceCents;
    const isBalanceSquared = balanceDiffCents === 0;

    return {
        realBalanceCents,
        realBalanceAlignedAt: manual?.alignedAt ?? null,
        calculatedBalanceCents,
        openingBalanceCents,
        statementClosingCents,
        movementsSumCents,
        balanceDiffCents,
        isBalanceSquared,
        unmatchedBankLines: unmatchedBank,
        unmatchedTotal: unmatchedBank,
        missingDocuments: floristWaiting,
    };
}
