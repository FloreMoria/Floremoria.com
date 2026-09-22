/**
 * Sola lettura — scostamenti X1–X6 vs fonti autorevoli (inventario 2026-09-22).
 * Non modifica dati.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '@/lib/prisma';
import { buildTaxRegisterReport } from '@/lib/financial/taxRegister';
import { calculateFinancialStatements } from '@/lib/financial/statements';
import { computeFinanceQuadratura } from '@/lib/financial/financeQuadratura';
import { getFinecoManualBalance } from '@/lib/financial/finecoBalance';
import {
    countFloristWaitingDocuments,
    listFloristCompensationRegister,
} from '@/lib/financial/floristCompensationRegister';
import { buildFloristInvoiceWorkList } from '@/lib/financial/floristInvoiceWorkList';
import { listFloristMissingInvoices } from '@/lib/financial/floristMissingInvoices';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { loadGatewaySyncRows } from '@/lib/financial/gatewaySyncRows';
import { computeGatewayQuadratura } from '@/lib/financial/gatewayQuadratura';
import { controlC13 } from '@/lib/financial/dossierFiscalControls';

function euro(c: number | null | undefined): string {
    if (c == null || !Number.isFinite(c)) return 'n/d';
    return (c / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function delta(a: number, b: number): string {
    return euro(a - b) + ` (€${euro(a)} − €${euro(b)})`;
}

async function main() {
    const year = 2026;

    // --- X1 Ricavi: tax-register YTD (T1–T3 + T4 se aperto) vs CE vs gateway corrispettivi ---
    const taxByQ: Array<{ q: number; gross: number; rows: number; fee: number; florist: number }> =
        [];
    let taxYtdGross = 0;
    let taxYtdFee = 0;
    let taxYtdFlorist = 0;
    let taxYtdRows = 0;
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(year, q);
        if (b.start > new Date()) continue;
        const r = await buildTaxRegisterReport({ year, quarter: q });
        taxByQ.push({
            q,
            gross: r.summary.grossCents,
            rows: r.summary.rowCount,
            fee: (r.summary as { gatewayFeesCents?: number }).gatewayFeesCents ?? 0,
            florist:
                (r.summary as { floristCompensationCents?: number }).floristCompensationCents ??
                r.rows.reduce((s, row) => s + row.floristCompensationCents, 0),
        });
        taxYtdGross += r.summary.grossCents;
        taxYtdFee += taxByQ[taxByQ.length - 1].fee;
        taxYtdFlorist += taxByQ[taxByQ.length - 1].florist;
        taxYtdRows += r.summary.rowCount;
    }

    // Full-year single call if period mode allows
    let taxYearGross: number | null = null;
    try {
        const ry = await buildTaxRegisterReport({ year, mode: 'year' });
        taxYearGross = ry.summary.grossCents;
    } catch {
        taxYearGross = null;
    }

    const statements = await calculateFinancialStatements();
    const pnl = await computeHistoricalPnl({ fiscalYear: year });

    let gwGross = 0;
    let gwRows = 0;
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(year, q);
        if (b.start > new Date()) continue;
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const row of built.rows) {
            gwGross += Math.abs(row.grossCents);
            gwRows += 1;
        }
    }

    // Ledger RICAVI raw (page stats.income style)
    const ledgerRicavi = await prisma.financialLedgerEntry.aggregate({
        where: {
            fiscalYear: year,
            reversedAt: null,
            category: 'RICAVI_VENDITE',
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        _sum: { totalCents: true },
        _count: true,
    });
    const ledgerIncomeCents = Math.abs(ledgerRicavi._sum.totalCents || 0);

    console.log('\n=== X1 RICAVI / CORRISPETTIVI ===');
    console.log('Autorevole: registro corrispettivi (tax-register) YTD somma trimestri');
    console.log('  tax-register YTD gross:', euro(taxYtdGross), 'righe', taxYtdRows, taxByQ);
    if (taxYearGross != null) console.log('  tax-register mode=year:', euro(taxYearGross));
    console.log('  CE ricaviVenditeCents:', euro(statements.contoEconomico.ricaviVenditeCents));
    console.log('  PNL ricaviLordiCents:', euro(pnl.ricaviLordiCents));
    console.log('  ledger RICAVI_VENDITE sum:', euro(ledgerIncomeCents), 'n=', ledgerRicavi._count);
    console.log('  gateway corrispettivi build YTD:', euro(gwGross), 'righe', gwRows);
    console.log(
        '  Δ CE − tax-register:',
        delta(statements.contoEconomico.ricaviVenditeCents, taxYtdGross)
    );
    console.log('  Δ ledger − tax-register:', delta(ledgerIncomeCents, taxYtdGross));
    console.log('  Δ gateway-build − tax-register:', delta(gwGross, taxYtdGross));

    // --- X2 Cassa ---
    const manual = await getFinecoManualBalance();
    const quad = await computeFinanceQuadratura();
    const lastClosing = await prisma.bankStatementDocument.findFirst({
        where: { closingBalanceCents: { not: null }, status: { in: ['PARSED', 'RECONCILED'] } },
        orderBy: [{ periodEnd: 'desc' }, { uploadedAt: 'desc' }],
        select: {
            fileName: true,
            closingBalanceCents: true,
            periodEnd: true,
            openingBalanceCents: true,
        },
    });
    console.log('\n=== X2 CASSA ===');
    console.log('Autorevole: estratto Fineco (closing / calculated da linee)');
    console.log('  ultimo closing estratto:', euro(lastClosing?.closingBalanceCents ?? null), lastClosing?.fileName, lastClosing?.periodEnd);
    console.log('  quadratura.calculatedBalanceCents:', euro(quad.calculatedBalanceCents));
    console.log('  quadratura.statementClosingCents:', euro(quad.statementClosingCents ?? null));
    console.log('  quadratura.openingBalanceCents:', euro(quad.openingBalanceCents ?? null));
    console.log('  saldo manuale Fineco:', euro(manual?.balanceCents ?? null), 'alignedAt', manual?.alignedAt);
    console.log('  SP cassaBancaCents:', euro(statements.statoPatrimoniale.cassaBancaCents));
    console.log(
        '  Δ manuale − calculated:',
        manual?.balanceCents != null
            ? delta(manual.balanceCents, quad.calculatedBalanceCents)
            : 'n/d (manuale assente)'
    );
    console.log(
        '  Δ SP − calculated:',
        delta(statements.statoPatrimoniale.cassaBancaCents, quad.calculatedBalanceCents)
    );
    console.log('  balanceDiffCents (manuale−libro):', euro(quad.balanceDiffCents));

    // --- X3 Fioristi ---
    const waitingComp = await countFloristWaitingDocuments();
    const register = await listFloristCompensationRegister();
    const waiting = register.filter((r) => r.docStatus === 'WAITING_INVOICE');
    const waitingWithDelivery = waiting.filter((r) => !!(r as { orderDeliveryDate?: string | null }).orderDeliveryDate || (r as { deliveryDate?: unknown }).deliveryDate);
    // compensation register rows have orderDate; check delivery on order fields
    const waitingDelivered = waiting.filter((r) => {
        const any = r as Record<string, unknown>;
        return Boolean(any.orderDeliveryDate || any.deliveryDate);
    });
    const work = await buildFloristInvoiceWorkList();
    const missing = await listFloristMissingInvoices();
    const missingWaiting = missing.filter((r) => {
        const st = (r as { docStatus?: string }).docStatus;
        return !st || st === 'WAITING_INVOICE';
    });

    // Consegne avvenute senza fattura (autorevole proposto)
    const ordersDeliveredNoInvoice = await prisma.order.count({
        where: {
            deletedAt: null,
            isTest: false,
            floristCompensationCents: { gt: 0 },
            deliveryDate: { not: null, lte: new Date() },
            status: { notIn: ['CANCELLED', 'PENDING'] },
        },
    });

    console.log('\n=== X3 CONTEGGI FIORISTA ===');
    console.log('Autorevole: consegne (non pagamenti bancari)');
    console.log('  Q03 missingDocuments (compensation WAITING):', waitingComp);
    console.log('  register WAITING_INVOICE:', waiting.length, 'di cui con deliveryDate campo:', waitingDelivered.length);
    console.log('  T09 missing-invoices list len:', missing.length, 'waiting-ish:', missingWaiting.length);
    console.log('  G02 work-list fioristi:', work.totalCount, 'importo', euro(work.totalAmountCents));
    console.log('  ordini consegnati con compenso>0 (proxy consegne):', ordersDeliveredNoInvoice);
    // Sample how work list dates work
    console.log('  work sample oldestPaymentDate:', work.rows.slice(0, 3).map((r) => ({
        name: r.floristName,
        days: r.daysSincePayment,
        oldest: r.oldestPaymentDate,
        amt: euro(r.amountPaidCents),
    })));

    // --- X4 Stripe ---
    let syncRows: Awaited<ReturnType<typeof loadGatewaySyncRows>> = [];
    try {
        syncRows = await loadGatewaySyncRows();
    } catch (e) {
        console.log('loadGatewaySyncRows error', e);
    }
    const stripeRows = syncRows.filter(
        (r) => r.gatewayCode === 'COM' || r.gatewayCode === 'EU' || r.channel === 'stripe'
    );
    // try gateway quadratura
    let gq: ReturnType<typeof computeGatewayQuadratura> | null = null;
    try {
        gq = computeGatewayQuadratura(syncRows as never);
    } catch (e) {
        console.log('computeGatewayQuadratura error', (e as Error).message);
    }
    let c13;
    try {
        c13 = await controlC13(year, 3);
    } catch (e) {
        c13 = { error: (e as Error).message };
    }

    // Live balance not available offline easily without API keys — note from gateways route if possible
    console.log('\n=== X4 STRIPE ===');
    console.log('Autorevole: report vendite gestore (= tax-register / corrispettivi); live = informativo');
    console.log('  tax-register YTD gross (vendite):', euro(taxYtdGross));
    console.log('  sync gateway stripe-like rows:', stripeRows.length);
    if (gq && 'stripe' in gq) {
        const s = (gq as { stripe: { saldoNettoMovimentiCents: number; walletApiCents: number | null; walletGapCents: number | null } }).stripe;
        console.log('  W07 saldoNettoMovimenti Stripe:', euro(s.saldoNettoMovimentiCents));
        console.log('  W07 walletApiCents:', euro(s.walletApiCents));
        console.log('  W07 walletGap:', euro(s.walletGapCents));
    }
    console.log('  C13 T3:', c13);

    // --- X5 Fee ---
    const stripeInvoices = await prisma.stripeServiceInvoice.findMany({
        where: {
            OR: [
                { periodKey: { startsWith: '2026' } },
                { issuedAt: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') } },
            ],
        },
        select: { totalFeeCents: true, periodKey: true, number: true, issuedAt: true },
    });
    const stripeFeeInvoiceSum = stripeInvoices.reduce((s, i) => s + i.totalFeeCents, 0);

    // Fee from tax register rows (per-order feeCents)
    let taxFeeFromRows = 0;
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(year, q);
        if (b.start > new Date()) continue;
        const r = await buildTaxRegisterReport({ year, quarter: q });
        taxFeeFromRows += r.rows.reduce((s, row) => s + (row.feeCents || 0), 0);
    }

    console.log('\n=== X5 FEE GATEWAY ===');
    console.log('Autorevole: fattura mensile gestore (StripeServiceInvoice)');
    console.log('  fatture Stripe YTD sum totalFeeCents:', euro(stripeFeeInvoiceSum), 'n=', stripeInvoices.length);
    console.log('  CE costiStripe / oneriBancari:', euro(statements.contoEconomico.costiStripeCents));
    console.log('  tax-register feeCents somma righe YTD:', euro(taxFeeFromRows));
    console.log('  Δ CE − fatture Stripe:', delta(statements.contoEconomico.costiStripeCents, stripeFeeInvoiceSum));
    console.log('  Δ tax-register fee − fatture Stripe:', delta(taxFeeFromRows, stripeFeeInvoiceSum));
    console.log('  fatture sample:', stripeInvoices.slice(0, 8));

    // --- X6 Sync vs registro ---
    const syncIncassi = syncRows.filter((r) => r.movementKind === 'incasso' || (r as { kind?: string }).kind === 'incasso');
    let syncIncassoCents = 0;
    for (const r of syncRows) {
        const kind = (r as { movementKind?: string; kind?: string }).movementKind || (r as { kind?: string }).kind;
        if (kind === 'incasso') syncIncassoCents += Math.abs(Number((r as { grossCents?: number; amountCents?: number }).grossCents ?? (r as { netCents?: number }).netCents ?? 0));
    }
    console.log('\n=== X6 SYNC GATEWAY vs REGISTRO ===');
    console.log('Autorevole: registro corrispettivi; sync subordinato');
    console.log('  tax-register YTD:', euro(taxYtdGross), 'righe', taxYtdRows);
    console.log('  gateway corrispettivi build:', euro(gwGross), 'righe', gwRows);
    console.log('  sync rows total:', syncRows.length, 'incassi approx cents:', euro(syncIncassoCents));
    console.log('  Δ sync-build − tax-register:', delta(gwGross, taxYtdGross));

    console.log('\n=== Q02 unmatched ===', quad.unmatchedTotal, 'daClassificare', euro(quad.daClassificareCents));

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
