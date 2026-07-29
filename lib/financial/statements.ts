import prisma from '@/lib/prisma';
import { getLedger } from './ledgerStore';

export interface ContoEconomico {
    ricaviVenditeCents: number;
    costiFioristiCents: number;
    costiStripeCents: number;
    costiSaasCents: number;
    costiMarketingCents: number;
    totaleCostiCents: number;
    ebitdaCents: number;
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
 */
export async function calculateFinancialStatements(): Promise<FinancialStatements> {
    const ledger = getLedger();
    const entries = ledger.accountingEntries || [];
    const transactions = ledger.transactions || [];

    // --- 1. CONTO ECONOMICO ---
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
            ebitdaCents
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
