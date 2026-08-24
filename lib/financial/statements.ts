/**
 * Bilancio gestionale Contabilità — esclusivamente da Neon (FinancialLedgerEntry + BankStatementLine).
 * Doppio binario: cassa reale (A) vs competenza fiscale/IVA (B).
 */

import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';

export interface ContoEconomico {
    ricaviVenditeCents: number;
    costiFioristiCents: number;
    costiStripeCents: number;
    costiSaasCents: number;
    costiMarketingCents: number;
    totaleCostiCents: number;
    ebitdaCents: number;
    ricaviNettiCents?: number;
    ivaDebitoCents?: number;
    ivaCreditoCents?: number;
    ivaNettaCents?: number;
    oneriBancariCents?: number;
    risultatoAnteImposteCents?: number;
    /** Binario A — flusso di cassa Fineco (centesimi interi). */
    cashInflowCents?: number;
    cashOutflowCents?: number;
    cashGatewayTransferCents?: number;
    cashBankBalanceCents?: number;
    source?: 'historical_ledger' | 'neon_empty';
}

export interface StatoPatrimoniale {
    cassaBancaCents: number;
    creditiClientiCents: number;
    debitiFornitoriCents: number;
    debitiTributariCents: number;
    patrimonioNettoCents: number;
}

export interface StimaImposte {
    iresCents: number;
    irapCents: number;
    utileNettoCents: number;
}

export interface FinancialStatements {
    contoEconomico: ContoEconomico;
    statoPatrimoniale: StatoPatrimoniale;
    stimaImposte: StimaImposte;
}

/**
 * Calcola CE / SP / imposte da Neon. Nessun fallback su financial_ledger.json.
 */
export async function calculateFinancialStatements(): Promise<FinancialStatements> {
    const year = new Date().getFullYear();
    const capitaleSocialeCents = 1_141_000; // €11.410 i.v.

    const pnl = await computeHistoricalPnl({ fiscalYear: year });

    const unpaidOrders = await prisma.order.findMany({
        where: { isTest: false, status: { in: ['ACCEPTED', 'PENDING'] }, deletedAt: null },
        select: { totalPriceCents: true },
    });
    const creditiClientiCents = unpaidOrders.reduce((s, o) => s + o.totalPriceCents, 0);

    let debitiFornitoriCents = 0;
    try {
        const unpaidInvoices = await prisma.supplierInvoice.findMany({
            where: { status: { in: ['UNPAID', 'PROCESSING'] } },
            select: { amount: true },
        });
        debitiFornitoriCents = unpaidInvoices.reduce(
            (sum, inv) => sum + Math.round(Number(inv.amount) * 100),
            0
        );
    } catch {
        debitiFornitoriCents = 0;
    }

    // Cassa: preferisci somma BankStatementLine; fallback aggregato ledger BANK_LINE
    let cassaBancaCents = pnl.cashBankBalanceCents ?? 0;
    if (cassaBancaCents === 0) {
        const bankSum = await prisma.financialLedgerEntry.aggregate({
            where: {
                fiscalYear: year,
                reversedAt: null,
                sourceType: 'BANK_LINE',
            },
            _sum: { totalCents: true },
        });
        cassaBancaCents = bankSum._sum.totalCents || 0;
    }

    const utilePreImposteCents = Math.max(0, pnl.risultatoAnteImposteCents);
    const iresCents = Math.round((utilePreImposteCents * 24) / 100);
    const baseIrapCents = Math.max(0, pnl.ricaviLordiCents - pnl.costiFioristiCents);
    const irapCents = Math.round((baseIrapCents * 39) / 1000); // 3.9% in interi
    const utileNettoCents = pnl.risultatoAnteImposteCents - iresCents - irapCents;

    const empty = pnl.entriesCount === 0;

    return {
        contoEconomico: {
            ricaviVenditeCents: pnl.ricaviLordiCents,
            ricaviNettiCents: pnl.ricaviNettiCents,
            costiFioristiCents: pnl.costiFioristiCents,
            costiStripeCents: pnl.oneriBancariCents,
            costiSaasCents: pnl.costiSaasCents,
            costiMarketingCents: 0,
            totaleCostiCents: pnl.costiProduzioneCents,
            ebitdaCents: pnl.ebitdaCents,
            ivaDebitoCents: pnl.ivaDebitoCents,
            ivaCreditoCents: pnl.ivaCreditoCents,
            ivaNettaCents: pnl.ivaNettaCents,
            oneriBancariCents: pnl.oneriBancariCents,
            risultatoAnteImposteCents: pnl.risultatoAnteImposteCents,
            cashInflowCents: pnl.cashInflowCents ?? 0,
            cashOutflowCents: pnl.cashOutflowCents ?? 0,
            cashGatewayTransferCents: pnl.cashGatewayTransferCents ?? 0,
            cashBankBalanceCents: cassaBancaCents,
            source: empty ? 'neon_empty' : 'historical_ledger',
        },
        statoPatrimoniale: {
            cassaBancaCents,
            creditiClientiCents,
            debitiFornitoriCents,
            debitiTributariCents: Math.max(0, pnl.ivaNettaCents) + iresCents + irapCents,
            patrimonioNettoCents: capitaleSocialeCents + utileNettoCents,
        },
        stimaImposte: { iresCents, irapCents, utileNettoCents },
    };
}
