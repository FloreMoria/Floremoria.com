/**
 * Fascia di quadratura Contabilità — 3 controlli server-side su Neon.
 * Solo lettura aggregata: nessun truncate / delete.
 */

import prisma from '@/lib/prisma';
import { getFinecoManualBalance } from '@/lib/financial/finecoBalance';
import { listFloristMissingInvoices } from '@/lib/financial/floristMissingInvoices';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';

export type FinanceQuadratura = {
    /** Saldo reale (manuale Fineco) in centesimi; null se non impostato. */
    realBalanceCents: number | null;
    realBalanceAlignedAt: string | null;
    /** Saldo calcolato da movimenti bancari / ledger. */
    calculatedBalanceCents: number;
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
 * Perché: above-the-fold operativo senza caricare tutta la UI.
 */
export async function computeFinanceQuadratura(): Promise<FinanceQuadratura> {
    const year = new Date().getFullYear();

    const [manual, pnl, unmatchedBank, floristMissing] = await Promise.all([
        getFinecoManualBalance(),
        computeHistoricalPnl({ fiscalYear: year }),
        prisma.bankStatementLine.count({
            where: { matchStatus: { not: 'MATCHED' } },
        }),
        listFloristMissingInvoices(),
    ]);

    let calculatedBalanceCents = pnl.cashBankBalanceCents ?? 0;
    if (calculatedBalanceCents === 0) {
        const bankSum = await prisma.financialLedgerEntry.aggregate({
            where: {
                fiscalYear: year,
                reversedAt: null,
                sourceType: 'BANK_LINE',
            },
            _sum: { totalCents: true },
        });
        calculatedBalanceCents = bankSum._sum.totalCents || 0;
    }

    const realBalanceCents = manual?.balanceCents ?? null;
    const balanceDiffCents =
        realBalanceCents == null ? null : realBalanceCents - calculatedBalanceCents;
    const isBalanceSquared = balanceDiffCents === 0;

    return {
        realBalanceCents,
        realBalanceAlignedAt: manual?.alignedAt ?? null,
        calculatedBalanceCents,
        balanceDiffCents,
        isBalanceSquared,
        unmatchedBankLines: unmatchedBank,
        unmatchedTotal: unmatchedBank,
        missingDocuments: floristMissing.length,
    };
}
