/**
 * Tooling dati reali Alberto — sole letture Prisma (read-only).
 * Nessuna scrittura su Order / Stripe / ledger.
 */

import prisma from '@/lib/prisma';
import {
    buildTaxQuarterlyReport,
    type TaxQuarter,
} from '@/lib/financial/taxQuarterly';
import {
    calculateRunwayMonths,
    estimateMonthlyBurnCents,
    operatingCashFlowSimple,
} from '@/lib/ai/agents/cfoSkills';
import { buildBankReconciliationReport } from '@/lib/financial/bankStatements/store';
import type { BankReconciliationReport } from '@/lib/financial/bankStatements/types';

const FLORIST_SHARE = 0.65;

function monthStartUtc(d = new Date()): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export type CfoQuarterlyTaxSummary = {
    year: number;
    quarter: TaxQuarter;
    label: string;
    corrispettiviLordoCents: number;
    imponibileIva10Cents: number;
    ivaDebitoCents: number;
    gatewayFeesDeductibleCents: number;
    floristCompensiCents: number;
    floristPaidCents: number;
    stripeInvoicesFeeCents: number;
    orderCount: number;
    asOf: string;
};

/** Prospetto trimestrale sintetico da ordini reali + fatture Stripe sincronizzate. */
export async function getCfoQuarterlyTaxSummary(
    year: number,
    quarter: TaxQuarter
): Promise<CfoQuarterlyTaxSummary> {
    const report = await buildTaxQuarterlyReport(year, quarter);
    return {
        year,
        quarter,
        label: report.bounds.label,
        corrispettiviLordoCents: report.summary.corrispettiviLordoCents,
        imponibileIva10Cents: report.summary.corrispettiviImponibileCents,
        ivaDebitoCents: report.summary.ivaDebito10Cents,
        gatewayFeesDeductibleCents: report.summary.gatewayFeesCents,
        floristCompensiCents: report.summary.floristCompensiCents,
        floristPaidCents: report.summary.floristPaidCents,
        stripeInvoicesFeeCents: report.summary.stripeInvoicesTotalCents,
        orderCount: report.corrispettivi.length,
        asOf: new Date().toISOString(),
    };
}

export type StripeCashOverview = {
    monthKey: string;
    movementsCount: number;
    /** Saldo netto movimenti sincronizzati (amountCents). */
    netBalanceCents: number;
    monthInflowsCents: number;
    monthFeesCents: number;
    monthRefundsCents: number;
    monthPayoutsToBankCents: number;
    asOf: string;
};

/** Overview cassa Stripe da `stripe_finance_movements` (mese corrente UTC). */
export async function getStripeCashOverview(): Promise<StripeCashOverview> {
    const start = monthStartUtc();
    const now = new Date();
    const monthKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;

    const [allNet, monthRows] = await Promise.all([
        prisma.stripeFinanceMovement.aggregate({
            _sum: { amountCents: true, feeCents: true },
            _count: { _all: true },
        }),
        prisma.stripeFinanceMovement.findMany({
            where: { createdAtStripe: { gte: start, lte: now } },
            select: {
                type: true,
                amountCents: true,
                feeCents: true,
                reportingCategory: true,
            },
        }),
    ]);

    let monthInflowsCents = 0;
    let monthFeesCents = 0;
    let monthRefundsCents = 0;
    let monthPayoutsToBankCents = 0;

    for (const row of monthRows) {
        monthFeesCents += Math.max(0, row.feeCents || 0);
        const t = (row.type || '').toLowerCase();
        if (t === 'payout' || row.reportingCategory === 'payout') {
            monthPayoutsToBankCents += Math.abs(row.amountCents);
            continue;
        }
        if (t.includes('refund') || t === 'payment_refund') {
            monthRefundsCents += Math.abs(row.amountCents);
            continue;
        }
        if (t === 'stripe_fee') {
            monthFeesCents += Math.abs(row.amountCents);
            continue;
        }
        if (row.amountCents > 0) {
            monthInflowsCents += row.amountCents;
        }
    }

    return {
        monthKey,
        movementsCount: allNet._count._all,
        netBalanceCents: allNet._sum.amountCents || 0,
        monthInflowsCents,
        monthFeesCents,
        monthRefundsCents,
        monthPayoutsToBankCents,
        asOf: now.toISOString(),
    };
}

export type FloristPayoutRow = {
    orderId: string;
    orderNumber: string;
    partnerName: string;
    partnerVat: string | null;
    grossOrderCents: number;
    compensoConcordatoCents: number;
    paymentStatus: string;
    liquidato: boolean;
    createdAt: string;
};

export type FloristPayoutStatus = {
    pendingCount: number;
    paidCount: number;
    pendingCents: number;
    paidCents: number;
    pending: FloristPayoutRow[];
    paid: FloristPayoutRow[];
    asOf: string;
};

/** Compensi fioristi pendenti vs liquidati (stima 65% lordo se non c’è listino in tool). */
export async function getFloristPayoutStatus(limit = 80): Promise<FloristPayoutStatus> {
    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            partnerId: { not: null },
            status: { notIn: ['CANCELLED', 'PENDING'] },
        },
        include: {
            partner: {
                select: { shopName: true, ownerName: true, vatNumber: true },
            },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 200),
    });

    const pending: FloristPayoutRow[] = [];
    const paid: FloristPayoutRow[] = [];

    for (const order of orders) {
        const gross =
            order.grossAmount != null
                ? Math.round(order.grossAmount * 100)
                : order.totalPriceCents;
        const compenso = Math.round(gross * FLORIST_SHARE);
        const liquidato = order.partnerPaymentStatus === 'PAID';
        const row: FloristPayoutRow = {
            orderId: order.id,
            orderNumber: order.orderNumber || order.id.slice(0, 8),
            partnerName:
                order.partner?.shopName || order.partner?.ownerName || 'Fiorista',
            partnerVat: order.partner?.vatNumber || null,
            grossOrderCents: gross,
            compensoConcordatoCents: compenso,
            paymentStatus: order.partnerPaymentStatus,
            liquidato,
            createdAt: order.createdAt.toISOString(),
        };
        if (liquidato) paid.push(row);
        else pending.push(row);
    }

    return {
        pendingCount: pending.length,
        paidCount: paid.length,
        pendingCents: pending.reduce((s, r) => s + r.compensoConcordatoCents, 0),
        paidCents: paid.reduce((s, r) => s + r.compensoConcordatoCents, 0),
        pending,
        paid,
        asOf: new Date().toISOString(),
    };
}

export type CompanyFinancialHealth = {
    estimatedCashCents: number;
    inflowsLast30dCents: number;
    outflowsLast30dCents: number;
    operatingCashFlow30dCents: number;
    monthlyBurnCents: number;
    runwayMonths: number | null;
    runwayStatus: string;
    stripePayoutsLast30dCents: number;
    sources: string[];
    asOf: string;
};

/**
 * Salute finanziaria stimata: ordini (incassi) + movimenti Stripe (fee/payout/refund) ultimi 30gg.
 */
export async function getCompanyFinancialHealth(): Promise<CompanyFinancialHealth> {
    const since = daysAgo(30);
    const sources: string[] = [];

    const paidOrders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: since },
            OR: [
                { stripeTransactionId: { not: null } },
                { status: { in: ['COMPLETED', 'IN_PROGRESS', 'DELIVERING', 'ACCEPTED'] } },
            ],
        },
        select: {
            totalPriceCents: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
        },
    });
    sources.push('Order (ultimi 30gg)');

    let inflowsLast30dCents = 0;
    let orderFeesCents = 0;
    for (const o of paidOrders) {
        const gross =
            o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents;
        inflowsLast30dCents += gross;
        if (o.stripeFee != null) orderFeesCents += Math.round(o.stripeFee * 100);
    }

    const stripeMovements = await prisma.stripeFinanceMovement.findMany({
        where: { createdAtStripe: { gte: since } },
        select: { type: true, amountCents: true, feeCents: true, reportingCategory: true },
    });
    sources.push('stripe_finance_movements (ultimi 30gg)');

    let stripeRefunds = 0;
    let stripePayouts = 0;
    let stripeFees = orderFeesCents;
    for (const m of stripeMovements) {
        const t = (m.type || '').toLowerCase();
        stripeFees += Math.max(0, m.feeCents || 0);
        if (t === 'payout' || m.reportingCategory === 'payout') {
            stripePayouts += Math.abs(m.amountCents);
        } else if (t.includes('refund')) {
            stripeRefunds += Math.abs(m.amountCents);
        } else if (t === 'stripe_fee') {
            stripeFees += Math.abs(m.amountCents);
        }
    }

    // Uscite operative stimate: fee + rimborsi + compensi fioristi liquidati negli ultimi 30gg
    const floristPaidRecent = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            partnerPaymentStatus: 'PAID',
            updatedAt: { gte: since },
            partnerId: { not: null },
        },
        select: { totalPriceCents: true, grossAmount: true },
    });
    sources.push('Order partnerPaymentStatus=PAID (updatedAt 30gg)');

    let floristOutCents = 0;
    for (const o of floristPaidRecent) {
        const gross =
            o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents;
        floristOutCents += Math.round(gross * FLORIST_SHARE);
    }

    const outflowsLast30dCents = stripeFees + stripeRefunds + floristOutCents;
    const operatingCashFlow30dCents = operatingCashFlowSimple({
        inflowsCents: inflowsLast30dCents,
        outflowsCents: outflowsLast30dCents,
    });
    const monthlyBurnCents = estimateMonthlyBurnCents({
        inflowsCents: inflowsLast30dCents,
        outflowsCents: outflowsLast30dCents,
        windowDays: 30,
    });

    // Cassa stimata: netto movimenti Stripe all-time (proxy) + buffer da netAmount ordini recenti
    const stripeNet = await prisma.stripeFinanceMovement.aggregate({
        _sum: { netCents: true, amountCents: true },
    });
    sources.push('stripe_finance_movements aggregate net');

    const estimatedCashCents =
        (stripeNet._sum.netCents ?? stripeNet._sum.amountCents ?? 0) ||
        Math.max(0, operatingCashFlow30dCents);

    const runway = calculateRunwayMonths({
        cashOnHandCents: Math.max(0, estimatedCashCents),
        monthlyBurnCents,
    });

    return {
        estimatedCashCents: Math.max(0, estimatedCashCents),
        inflowsLast30dCents,
        outflowsLast30dCents,
        operatingCashFlow30dCents,
        monthlyBurnCents,
        runwayMonths: runway.runwayMonths,
        runwayStatus: runway.status,
        stripePayoutsLast30dCents: stripePayouts,
        sources,
        asOf: new Date().toISOString(),
    };
}

/** Report riconciliazione cassa: saldo bancario (ultimo estratto) vs ledger / Stripe. */
export async function getBankReconciliationReport(
    documentId?: string
): Promise<BankReconciliationReport> {
    return buildBankReconciliationReport(documentId);
}

/** Registro tool invocabili da Alberto (nome → handler). */
export const ALBERTO_CFO_TOOLS = {
    getCfoQuarterlyTaxSummary,
    getStripeCashOverview,
    getFloristPayoutStatus,
    getCompanyFinancialHealth,
    getBankReconciliationReport,
} as const;

export type AlbertoCfoToolName = keyof typeof ALBERTO_CFO_TOOLS;

export function describeAlbertoCfoToolsForPrompt(): string {
    return [
        '## Tool dati reali (read-only PostgreSQL/Prisma)',
        '- getCfoQuarterlyTaxSummary(year, quarter) → corrispettivi, IVA 10%, fee gateway, compensi fioristi',
        '- getStripeCashOverview() → movimenti Stripe, fee, rimborsi, payout Fineco (mese)',
        '- getFloristPayoutStatus() → pendenti vs liquidati',
        '- getCompanyFinancialHealth() → cassa stimata, 30gg in/out, burn, runway',
        '- getBankReconciliationReport(documentId?) → saldo estratto Fineco vs ledger/Stripe, unmatched sample',
        'Tutti i tool sono sola lettura. Non inventare totali se il tool fallisce.',
    ].join('\n');
}

/**
 * Snapshot arricchito per system prompt (best-effort; errori → messaggio esplicito).
 */
export async function loadAlbertoCfoLiveSnapshot(params?: {
    year?: number;
    quarter?: TaxQuarter;
}): Promise<{
    ok: boolean;
    text: string;
    quarterly?: CfoQuarterlyTaxSummary;
    stripe?: StripeCashOverview;
    florists?: Omit<FloristPayoutStatus, 'pending' | 'paid'> & {
        pendingSample: FloristPayoutRow[];
        paidSample: FloristPayoutRow[];
    };
    health?: CompanyFinancialHealth;
    bankRecon?: BankReconciliationReport;
    errors: string[];
}> {
    const errors: string[] = [];
    const now = new Date();
    const year = params?.year ?? now.getFullYear();
    const quarter =
        params?.quarter ?? ((Math.floor(now.getMonth() / 3) + 1) as TaxQuarter);

    let quarterly: CfoQuarterlyTaxSummary | undefined;
    let stripe: StripeCashOverview | undefined;
    let floristsFull: FloristPayoutStatus | undefined;
    let health: CompanyFinancialHealth | undefined;
    let bankRecon: BankReconciliationReport | undefined;

    try {
        quarterly = await getCfoQuarterlyTaxSummary(year, quarter);
    } catch (e) {
        errors.push(`quarterly: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
        stripe = await getStripeCashOverview();
    } catch (e) {
        errors.push(`stripe: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
        floristsFull = await getFloristPayoutStatus(40);
    } catch (e) {
        errors.push(`florists: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
        health = await getCompanyFinancialHealth();
    } catch (e) {
        errors.push(`health: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
        bankRecon = await getBankReconciliationReport();
    } catch (e) {
        errors.push(`bankRecon: ${e instanceof Error ? e.message : String(e)}`);
    }

    const euro = (c: number) => (c / 100).toFixed(2);

    const lines = [
        '## Snapshot dati reali FloreMoria (read-only)',
        quarterly
            ? [
                  `### Fisco ${quarterly.label}`,
                  `- Lordo corrispettivi: €${euro(quarterly.corrispettiviLordoCents)} (${quarterly.orderCount} ordini)`,
                  `- Imponibile IVA 10%: €${euro(quarterly.imponibileIva10Cents)}`,
                  `- IVA a debito 10%: €${euro(quarterly.ivaDebitoCents)}`,
                  `- Fee gateway deducibili: €${euro(quarterly.gatewayFeesDeductibleCents)}`,
                  `- Compensi fioristi (concordati / pagati): €${euro(quarterly.floristCompensiCents)} / €${euro(quarterly.floristPaidCents)}`,
              ].join('\n')
            : '- Fisco trimestrale: non disponibile',
        stripe
            ? [
                  `### Stripe ${stripe.monthKey}`,
                  `- Movimenti sync: ${stripe.movementsCount}; netto ledger: €${euro(stripe.netBalanceCents)}`,
                  `- Incassi mese: €${euro(stripe.monthInflowsCents)}; fee: €${euro(stripe.monthFeesCents)}`,
                  `- Rimborsi: €${euro(stripe.monthRefundsCents)}; payout→banca: €${euro(stripe.monthPayoutsToBankCents)}`,
              ].join('\n')
            : '- Stripe overview: non disponibile',
        floristsFull
            ? [
                  '### Fioristi',
                  `- Pendenti: ${floristsFull.pendingCount} (€${euro(floristsFull.pendingCents)})`,
                  `- Liquidati: ${floristsFull.paidCount} (€${euro(floristsFull.paidCents)})`,
              ].join('\n')
            : '- Fioristi: non disponibile',
        health
            ? [
                  '### Health / Runway',
                  `- Cassa stimata: €${euro(health.estimatedCashCents)}`,
                  `- Entrate 30gg: €${euro(health.inflowsLast30dCents)}; uscite 30gg: €${euro(health.outflowsLast30dCents)}`,
                  `- Burn mensile stimato: €${euro(health.monthlyBurnCents)}; runway: ${
                      health.runwayMonths == null ? 'n/d (cash+) ' : `${health.runwayMonths} mesi`
                  } (${health.runwayStatus})`,
              ].join('\n')
            : '- Health: non disponibile',
        bankRecon
            ? [
                  '### Riconciliazione cassa Fineco (estratto vs ledger)',
                  bankRecon.fileName
                      ? `- Ultimo rendiconto: ${bankRecon.fileName} (${bankRecon.periodStart || '?'} → ${bankRecon.periodEnd || '?'})`
                      : '- Nessun estratto conto elaborato in archivio',
                  `- Saldo bancario (estratto): ${
                      bankRecon.bankClosingBalanceCents == null
                          ? 'n/d'
                          : `€${euro(bankRecon.bankClosingBalanceCents)}`
                  }`,
                  `- Saldo contabile ledger: €${euro(bankRecon.ledgerBalanceCents)}`,
                  `- Proxy cassa Stripe: €${euro(bankRecon.stripeProxyCashCents)}`,
                  `- Delta banca−ledger: €${euro(bankRecon.deltaBankVsLedgerCents)}`,
                  `- Match: ${bankRecon.matchedCount} abbinati / ${bankRecon.unmatchedCount} da revisionare`,
              ].join('\n')
            : '- Riconciliazione bancaria: non disponibile',
        errors.length ? `Errori tool: ${errors.join(' | ')}` : null,
        'Valutazione preliminare soggetta a conferma del professionista abilitato.',
    ].filter(Boolean) as string[];

    return {
        ok: errors.length === 0,
        text: lines.join('\n\n'),
        quarterly,
        stripe,
        florists: floristsFull
            ? {
                  pendingCount: floristsFull.pendingCount,
                  paidCount: floristsFull.paidCount,
                  pendingCents: floristsFull.pendingCents,
                  paidCents: floristsFull.paidCents,
                  asOf: floristsFull.asOf,
                  pendingSample: floristsFull.pending.slice(0, 5),
                  paidSample: floristsFull.paid.slice(0, 5),
              }
            : undefined,
        health,
        bankRecon,
        errors,
    };
}
