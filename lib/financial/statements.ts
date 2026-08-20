import prisma from '@/lib/prisma';
import { getLedger } from './ledgerStore';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';

export interface ContoEconomico {
    ricaviVenditeCents: number;
    costiFioristiCents: number;
    costiStripeCents: number;
    costiSaasCents: number;
    costiMarketingCents: number;
    totaleCostiCents: number;
    ebitdaCents: number;
    /** Campi Registro Storico Permanente */
    ricaviNettiCents?: number;
    ivaDebitoCents?: number;
    ivaCreditoCents?: number;
    ivaNettaCents?: number;
    oneriBancariCents?: number;
    risultatoAnteImposteCents?: number;
    source?: 'historical_ledger' | 'json_ledger';
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
 * Calcola il bilancio gestionale e la stima fiscale per FloreMoria S.r.l.
 * Preferisce il Registro Storico Permanente Neon se popolato.
 */
export async function calculateFinancialStatements(): Promise<FinancialStatements> {
    const year = new Date().getFullYear();
    try {
        const count = await prisma.financialLedgerEntry.count({
            where: { fiscalYear: year, reversedAt: null },
        });
        if (count > 0) {
            const pnl = await computeHistoricalPnl({ fiscalYear: year });
            const unpaidOrders = await prisma.order.findMany({
                where: { isTest: false, status: { in: ['ACCEPTED', 'PENDING'] } },
                select: { totalPriceCents: true },
            });
            const creditiClientiCents = unpaidOrders.reduce((s, o) => s + o.totalPriceCents, 0);
            let unpaidInvoices: Array<{ amount: { toNumber?: () => number } | number }> = [];
            try {
                unpaidInvoices = await prisma.supplierInvoice.findMany({
                    where: { status: { in: ['UNPAID', 'PROCESSING'] } },
                });
            } catch {
                unpaidInvoices = [];
            }
            const debitiFornitoriCents = unpaidInvoices.reduce(
                (sum, inv) => sum + Math.round(Number(inv.amount) * 100),
                0
            );
            const utilePreImposteCents = Math.max(0, pnl.risultatoAnteImposteCents);
            const iresCents = Math.round(utilePreImposteCents * 0.24);
            const baseIrapCents = Math.max(0, pnl.ricaviLordiCents - pnl.costiFioristiCents);
            const irapCents = Math.round(baseIrapCents * 0.039);
            const utileNettoCents = pnl.risultatoAnteImposteCents - iresCents - irapCents;
            const capitaleSocialeCents = 1141000;

            // Cassa da movimenti Fineco nel registro
            const bankSum = await prisma.financialLedgerEntry.aggregate({
                where: {
                    fiscalYear: year,
                    reversedAt: null,
                    sourceType: 'BANK_LINE',
                },
                _sum: { totalCents: true },
            });

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
                    source: 'historical_ledger',
                },
                statoPatrimoniale: {
                    cassaBancaCents: bankSum._sum.totalCents || 0,
                    creditiClientiCents,
                    debitiFornitoriCents,
                    debitiTributariCents: Math.max(0, pnl.ivaNettaCents) + iresCents + irapCents,
                    patrimonioNettoCents: capitaleSocialeCents + utileNettoCents,
                },
                stimaImposte: { iresCents, irapCents, utileNettoCents },
            };
        }
    } catch (err) {
        console.warn('[statements] historical ledger non disponibile, fallback JSON', err);
    }

    const ledger = getLedger();
    const entries = ledger.accountingEntries || [];
    const transactions = ledger.transactions || [];

    // --- 1. CONTO ECONOMICO (fallback JSON) ---
    let ricaviVenditeCents = 0;
    let costiFioristiCents = 0;
    let costiStripeCents = 0;
    let costiSaasCents = 0;
    let costiMarketingCents = 0;

    for (const entry of entries) {
        // Ricavi: Avere su conto ricavi
        if (entry.avereAccount && entry.avereAccount.includes('Ricavi da Vendite')) {
            ricaviVenditeCents += entry.amountCents;
        }

        // Costi: Dare su conto costi
        if (entry.dareAccount && entry.dareAccount.includes('Costi di Produzione')) {
            costiFioristiCents += entry.amountCents;
        } else if (entry.dareAccount && entry.dareAccount.includes('Commissioni Stripe')) {
            costiStripeCents += entry.amountCents;
        } else if (entry.dareAccount && entry.dareAccount.includes('Software SaaS')) {
            costiSaasCents += entry.amountCents;
        } else if (entry.dareAccount && entry.dareAccount.includes('Servizi Pubblicitari')) {
            costiMarketingCents += entry.amountCents;
        }
    }

    const totaleCostiCents = costiFioristiCents + costiStripeCents + costiSaasCents + costiMarketingCents;
    const ebitdaCents = ricaviVenditeCents - totaleCostiCents;

    // --- 2. STIMA IMPOSTE (IRES 24%, IRAP ~3.9%) ---
    const utilePreImposteCents = Math.max(0, ebitdaCents);
    const iresCents = Math.round(utilePreImposteCents * 0.24);
    // Base imponibile IRAP semplificata (Valore della produzione - Costi fioristi/produzione)
    const baseIrapCents = Math.max(0, ricaviVenditeCents - costiFioristiCents);
    const irapCents = Math.round(baseIrapCents * 0.039);
    const utileNettoCents = ebitdaCents - iresCents - irapCents;

    // --- 3. STATO PATRIMONIALE ---
    // Cassa/Banca: Saldo effettivo delle transazioni registrate
    let cassaBancaCents = 0;
    for (const tx of transactions) {
        cassaBancaCents += tx.amountCents;
    }

    // Crediti v/Clienti: Ordini manuali inseriti non ancora saldati (es. in stato ACCEPTED)
    const unpaidOrders = await prisma.order.findMany({
        where: {
            isTest: false,
            status: { in: ['ACCEPTED', 'PENDING'] }
        }
    });
    const creditiClientiCents = unpaidOrders.reduce((sum, o) => sum + o.totalPriceCents, 0);

    // Debiti v/Fornitori: Fatture passive non pagate nel DB
    const unpaidInvoices = await prisma.supplierInvoice.findMany({
        where: {
            status: { in: ['UNPAID', 'PROCESSING'] }
        }
    });
    // Decimal a number cents
    const debitiFornitoriCents = unpaidInvoices.reduce((sum, inv) => sum + Math.round(Number(inv.amount) * 100), 0);

    // Debiti Tributari: IVA a debito (IVA sulle vendite - IVA acquisti) + Imposte stimate (IRES/IRAP) + Ritenute accumulate non ancora versate
    let ivaDebitoCents = 0;
    for (const entry of entries) {
        if (entry.avereAccount && entry.avereAccount.includes('Ricavi')) {
            ivaDebitoCents += entry.vatAmountCents;
        } else if (entry.dareAccount && (entry.dareAccount.includes('Costi') || entry.dareAccount.includes('Software'))) {
            ivaDebitoCents -= entry.vatAmountCents;
        }
    }
    const debitiTributariCents = Math.max(0, ivaDebitoCents) + iresCents + irapCents;

    // Capitale Sociale di base FloreMoria S.r.l. (Startup Innovativa): €11.410,00 i.v.
    const capitaleSocialeCents = 1141000;
    const patrimonioNettoCents = capitaleSocialeCents + utileNettoCents;

    return {
        contoEconomico: {
            ricaviVenditeCents,
            costiFioristiCents,
            costiStripeCents,
            costiSaasCents,
            costiMarketingCents,
            totaleCostiCents,
            ebitdaCents,
            source: 'json_ledger' as const,
        },
        stimaImposte: {
            iresCents,
            irapCents,
            utileNettoCents
        },
        statoPatrimoniale: {
            cassaBancaCents,
            creditiClientiCents,
            debitiFornitoriCents,
            debitiTributariCents,
            patrimonioNettoCents
        }
    };
}
