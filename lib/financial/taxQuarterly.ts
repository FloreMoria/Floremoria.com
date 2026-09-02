/**
 * Report Contabilità Fiscale Trimestrale — prospetti per commercialista.
 */

import prisma from '@/lib/prisma';
import {
    euroFloatToCents,
    formatEuroFromCents,
    isAccessoryCategory,
    scorporaIvaFloreale,
    scorporaVenditaFloreale,
    VAT_PCT_FLORAL,
    VAT_PCT_ORDINARY,
} from '@/lib/financial/vat';
import { resolveOrderFloristCompensationCents } from '@/lib/financial/taxRegister';
import {
    buildPaypalMonthlyFeeRows,
    type PaypalMonthlyFeeRow,
} from '@/lib/financial/paypalMonthlyFees';
import { extractBareFinecoTrn } from '@/lib/financial/bankStatements/parseFinecoPaste';
import {
    normalizePaypalTransactionId,
    parsePaypalSourceKey,
} from '@/lib/financial/paypalSourceKeys';

/** Tax ID Stripe Payments Europe Ltd (IE). */
const STRIPE_VENDOR_TAX_ID = 'IE3206488LH';
/** Tax ID PayPal Europe (LU) — allineare alla fattura gateway se diversa. */
const PAYPAL_VENDOR_TAX_ID = 'LU26375245';
const PAYPAL_VENDOR_NAME = 'PayPal (Europe) S.à r.l. et Cie, S.C.A.';

export type TaxQuarter = 1 | 2 | 3 | 4;

export type QuarterlyBounds = {
    year: number;
    quarter: TaxQuarter;
    start: Date;
    end: Date;
    label: string;
};

export function resolveQuarterBounds(year: number, quarter: TaxQuarter): QuarterlyBounds {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
    return {
        year,
        quarter,
        start,
        end,
        label: `Q${quarter} ${year}`,
    };
}

/** Bounds di un singolo mese solare (label MM/YYYY; quarter = trimestre di appartenenza). */
export function resolveMonthBounds(year: number, month: number): QuarterlyBounds {
    const m = Math.min(12, Math.max(1, Math.floor(month)));
    const start = new Date(year, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, m, 0, 23, 59, 59, 999);
    const quarter = (Math.floor((m - 1) / 3) + 1) as TaxQuarter;
    return {
        year,
        quarter,
        start,
        end,
        label: `${String(m).padStart(2, '0')}/${year}`,
    };
}

export type CorrispettivoRow = {
    orderId: string;
    orderNumber: string;
    /** Data ordine (legacy CSV). */
    date: string;
    /** Data effettiva incasso gateway / pagamento. */
    paymentDate: string;
    buyerName: string;
    buyerTaxId: string;
    buyerCountry: string;
    gateway: string;
    paymentMethod: string;
    grossCents: number;
    imponibileCents: number;
    ivaDebitoCents: number;
    vatRate: number;
    gatewayFeeCents: number;
    netCents: number;
    transactionId: string;
};

export type ReverseChargeRow = {
    competenceMonth: string;
    vendorName: string;
    vendorTaxId: string;
    gatewayInvoiceNumber: string;
    issuedAt: string;
    taxableFeeCents: number;
    vatReverseChargeCents: number;
    autofatturaTd17Ref: string;
    source: 'stripe' | 'paypal';
};

export type FloristPassivoRow = {
    orderId: string;
    orderNumber: string;
    partnerName: string;
    partnerTaxId: string | null;
    partnerIban: string | null;
    compensoConcordatoCents: number;
    bonificoDate: string | null;
    bonificoTrn: string | null;
    sdiInvoiceNumber: string | null;
    sdiDate: string | null;
    imponibilePassivoCents: number;
    ivaPassivaCents: number;
    totaleFatturaCents: number;
};

export type IvaPeriodSummary = {
    corrispettiviLordoCents: number;
    imponibileVendite10Cents: number;
    ivaDebitoVendite10Cents: number;
    reverseChargeImponibileCents: number;
    reverseChargeIvaCents: number;
    floristImponibileCents: number;
    floristIvaCreditoCents: number;
    /** Positivo = debito, negativo = credito. */
    saldoIvaStimatoCents: number;
};

export type StripeInvoiceRow = {
    id: string;
    periodKey: string;
    number: string;
    issuedAt: string;
    periodStart: string;
    periodEnd: string;
    totalFeeCents: number;
    taxableFeeCents: number;
    vatReverseChargeCents: number;
    vendorName: string;
    invoicePdfUrl: string | null;
    hasPdf: boolean;
};

export type FloristLiquidazioneRow = {
    orderId: string;
    orderNumber: string;
    date: string;
    partnerName: string;
    partnerVat: string | null;
    grossOrderCents: number;
    compensoConcordatoCents: number;
    paymentStatus: string;
    bonificoInviato: boolean;
    fatturaPassivaStato: string;
};

export type TaxQuarterlyReport = {
    bounds: QuarterlyBounds;
    summary: {
        corrispettiviLordoCents: number;
        corrispettiviImponibileCents: number;
        ivaDebito10Cents: number;
        gatewayFeesCents: number;
        cashGatewayFeesCents: number;
        cashNettoIncassatoCents: number;
        stripeInvoicesTotalCents: number;
        paypalFeesTotalCents: number;
        floristCompensiCents: number;
        floristPaidCents: number;
        ivaCreditoFlorist10Cents: number;
    };
    corrispettivi: CorrispettivoRow[];
    reverseCharge: ReverseChargeRow[];
    floristPassivo: FloristPassivoRow[];
    ivaSummary: IvaPeriodSummary;
    stripeInvoices: StripeInvoiceRow[];
    paypalMonthlyFees: PaypalMonthlyFeeRow[];
    /** @deprecated Usare floristPassivo — mantenuto per compat JSON. */
    floristLiquidazioni: FloristLiquidazioneRow[];
};

function isPaypalPaymentLabel(label: string | null | undefined): boolean {
    return /paypal/i.test(label || '');
}

function resolveGatewayName(params: {
    paymentMethodLabel: string | null;
    hasPaypalLedger: boolean;
    hasStripeMovement: boolean;
}): string {
    if (isPaypalPaymentLabel(params.paymentMethodLabel) || params.hasPaypalLedger) {
        return 'PayPal';
    }
    if (params.hasStripeMovement || /stripe|card|apple|google/i.test(params.paymentMethodLabel || '')) {
        return 'Stripe';
    }
    return params.paymentMethodLabel?.trim() || 'Stripe';
}

function readExpenseMeta(raw: unknown): Record<string, unknown> {
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function expenseInvoiceNumber(meta: Record<string, unknown>, fallback?: string | null): string {
    if (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber.trim()) {
        return meta.invoiceNumber.trim();
    }
    if (typeof meta.documentNumber === 'string' && meta.documentNumber.trim()) {
        return meta.documentNumber.trim();
    }
    return fallback?.trim() || '';
}

function floristVatBreakdown(compensoCents: number, floristVatRate: number | null | undefined) {
    const ratePct =
        floristVatRate != null && floristVatRate > 0 && floristVatRate <= 1
            ? Math.round(floristVatRate * 100)
            : VAT_PCT_FLORAL;
    if (ratePct === VAT_PCT_FLORAL) {
        const v = scorporaIvaFloreale(compensoCents);
        return {
            imponibileCents: v.imponibileCents,
            ivaCents: v.ivaCents,
            totaleCents: compensoCents,
        };
    }
    const imponibileCents = Math.round(compensoCents / (1 + ratePct / 100));
    const ivaCents = compensoCents - imponibileCents;
    return { imponibileCents, ivaCents, totaleCents: compensoCents };
}

async function loadAutofatturaRefByForeignInvoice(
    bounds: QuarterlyBounds
): Promise<Map<string, string>> {
    const rows = await prisma.manualFinanceExpense.findMany({
        where: {
            expenseDate: { gte: bounds.start, lte: bounds.end },
            OR: [
                { notes: { startsWith: 'AUTOFATTURA_TD17' } },
                { notes: { startsWith: 'AUTOFATTURA_TD18' } },
            ],
        },
        select: { notes: true, metadataJson: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
        const meta = readExpenseMeta(row.metadataJson);
        const foreign =
            typeof meta.foreignInvoiceNumber === 'string' ? meta.foreignInvoiceNumber.trim() : '';
        const doc =
            typeof meta.documentNumber === 'string'
                ? meta.documentNumber.trim()
                : String(row.notes || '')
                      .replace(/^AUTOFATTURA_TD1[78]\s+/i, '')
                      .trim();
        if (foreign && doc) {
            map.set(foreign.toUpperCase(), doc);
            map.set(foreign, doc);
        }
        if (typeof meta.periodKey === 'string' && doc) {
            map.set(meta.periodKey, doc);
            map.set(`PP-FEE-${meta.periodKey}`, doc);
        }
    }
    return map;
}

export async function buildTaxQuarterlyReport(
    year: number,
    quarter: TaxQuarter,
    opts?: { month?: number | null }
): Promise<TaxQuarterlyReport> {
    const month = opts?.month != null && opts.month >= 1 && opts.month <= 12 ? opts.month : null;
    const bounds = month ? resolveMonthBounds(year, month) : resolveQuarterBounds(year, quarter);

    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: bounds.start, lte: bounds.end },
            status: { notIn: ['CANCELLED', 'PENDING'] },
            OR: [
                { grossAmount: { not: null } },
                { stripeTransactionId: { not: null } },
                { status: { in: ['COMPLETED', 'IN_PROGRESS', 'DELIVERING', 'ACCEPTED'] } },
            ],
        },
        include: {
            user: { select: { vatNumber: true } },
            partner: {
                select: {
                    shopName: true,
                    ownerName: true,
                    vatNumber: true,
                    taxCode: true,
                    iban: true,
                    paymentStatus: true,
                    internalNotes: true,
                },
            },
            items: {
                include: {
                    product: {
                        include: { category: { select: { slug: true, name: true } } },
                    },
                },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    const orderIds = orders.map((o) => o.id);
    const orderNumbers = orders
        .map((o) => o.orderNumber)
        .filter((n): n is string => Boolean(n));

    const [stripeMoves, paypalLedger, bankLines, autofatturaRefs] = await Promise.all([
            orderIds.length
                ? prisma.stripeFinanceMovement.findMany({
                      where: { orderId: { in: orderIds } },
                      orderBy: { createdAtStripe: 'desc' },
                  })
                : Promise.resolve([]),
            orderIds.length
                ? prisma.financialLedgerEntry.findMany({
                      where: {
                          reversedAt: null,
                          OR: [
                              { orderId: { in: orderIds } },
                              ...(orderNumbers.length
                                  ? orderNumbers.map((num) => ({
                                        description: { contains: num, mode: 'insensitive' as const },
                                    }))
                                  : []),
                          ],
                          sourceKey: { startsWith: 'PAYPAL_' },
                      },
                      select: {
                          orderId: true,
                          sourceKey: true,
                          accountingDate: true,
                          totalCents: true,
                          description: true,
                          metadataJson: true,
                      },
                  })
                : Promise.resolve([]),
            orderIds.length
                ? prisma.bankStatementLine.findMany({
                      where: {
                          matchedOrderId: { in: orderIds },
                          amountCents: { lt: 0 },
                      },
                      orderBy: { accountingDate: 'desc' },
                  })
                : Promise.resolve([]),
            loadAutofatturaRefByForeignInvoice(bounds),
        ]);

    const bankLineIds = bankLines.map((l) => l.id);
    const floristExpenses =
        orderIds.length > 0
            ? await prisma.manualFinanceExpense.findMany({
                  where: {
                      OR: [
                          ...orderIds.map((id) => ({
                              metadataJson: { path: ['orderId'], equals: id },
                          })),
                          ...(bankLineIds.length
                              ? [{ matchedStatementLineId: { in: bankLineIds } }]
                              : []),
                      ],
                  },
              })
            : [];

    const stripeByOrderId = new Map<string, (typeof stripeMoves)[number]>();
    for (const m of stripeMoves) {
        if (!m.orderId) continue;
        const prev = stripeByOrderId.get(m.orderId);
        if (!prev || Math.abs(m.amountCents) >= Math.abs(prev.amountCents)) {
            stripeByOrderId.set(m.orderId, m);
        }
    }

    type PaypalAgg = {
        paymentDate: Date;
        transactionId: string;
        feeCents: number;
        grossCents: number;
    };
    const paypalByOrderId = new Map<string, PaypalAgg>();
    const paypalByOrderNumber = new Map<string, PaypalAgg>();

    for (const e of paypalLedger) {
        const parsed = parsePaypalSourceKey(e.sourceKey || '');
        if (parsed?.kind === 'FEE' || parsed?.kind === 'PAYOUT' || parsed?.kind === 'REFUND') {
            continue;
        }
        const meta = readExpenseMeta(e.metadataJson);
        const txId =
            normalizePaypalTransactionId(parsed?.transactionId) ||
            normalizePaypalTransactionId(
                typeof meta.paypalTransactionId === 'string' ? meta.paypalTransactionId : null
            ) ||
            '';
        const feeCents = Math.abs(Number(meta.feeCents || 0));
        const grossCents = Math.abs(e.totalCents || 0);
        const agg: PaypalAgg = {
            paymentDate: e.accountingDate,
            transactionId: txId,
            feeCents,
            grossCents,
        };

        if (e.orderId) {
            const prev = paypalByOrderId.get(e.orderId);
            if (!prev || grossCents >= prev.grossCents) {
                paypalByOrderId.set(e.orderId, {
                    ...agg,
                    feeCents: Math.max(feeCents, prev?.feeCents || 0),
                });
            }
        }

        for (const num of orderNumbers) {
            if (num && e.description?.includes(num)) {
                const prev = paypalByOrderNumber.get(num);
                if (!prev || grossCents >= prev.grossCents) {
                    paypalByOrderNumber.set(num, agg);
                }
            }
        }
    }

    for (const e of paypalLedger) {
        const parsed = parsePaypalSourceKey(e.sourceKey || '');
        if (parsed?.kind !== 'FEE') continue;
        const txId = normalizePaypalTransactionId(parsed.transactionId);
        for (const [orderId, agg] of paypalByOrderId) {
            if (agg.transactionId === txId) {
                agg.feeCents = Math.max(agg.feeCents, Math.abs(e.totalCents || 0));
                paypalByOrderId.set(orderId, agg);
            }
        }
        for (const [num, agg] of paypalByOrderNumber) {
            if (agg.transactionId === txId) {
                agg.feeCents = Math.max(agg.feeCents, Math.abs(e.totalCents || 0));
                paypalByOrderNumber.set(num, agg);
            }
        }
    }

    const bankLineByOrderId = new Map<string, (typeof bankLines)[number]>();
    for (const line of bankLines) {
        if (!line.matchedOrderId) continue;
        const prev = bankLineByOrderId.get(line.matchedOrderId);
        if (!prev) {
            bankLineByOrderId.set(line.matchedOrderId, line);
            continue;
        }
        const isFlorist =
            /FLORIST/i.test(line.matchType || '') ||
            /FIORIST|COMPENSO|BONIFICO/i.test(line.description);
        if (isFlorist) bankLineByOrderId.set(line.matchedOrderId, line);
    }

    const expenseByOrderId = new Map<string, (typeof floristExpenses)[number]>();
    for (const exp of floristExpenses) {
        const meta = readExpenseMeta(exp.metadataJson);
        const orderId = typeof meta.orderId === 'string' ? meta.orderId : null;
        if (orderId) expenseByOrderId.set(orderId, exp);
    }
    for (const line of bankLines) {
        if (!line.matchedOrderId) continue;
        const raw = readExpenseMeta(line.rawJson);
        const alert = readExpenseMeta(raw.floristAlert);
        const linkedId =
            typeof alert.linkedExpenseId === 'string' ? alert.linkedExpenseId : null;
        if (linkedId) {
            const exp = floristExpenses.find((e) => e.id === linkedId);
            if (exp) expenseByOrderId.set(line.matchedOrderId, exp);
        }
    }

    const corrispettivi: CorrispettivoRow[] = [];
    for (const order of orders) {
        const grossCents =
            order.grossAmount != null
                ? euroFloatToCents(order.grossAmount)
                : order.totalPriceCents;

        let accessoryCents =
            order.accessoryAmountCents != null ? order.accessoryAmountCents : 0;
        if (order.accessoryAmountCents == null) {
            for (const item of order.items) {
                const cat = item.product?.category;
                if (isAccessoryCategory(cat?.slug) || isAccessoryCategory(cat?.name)) {
                    accessoryCents += item.priceCents * item.quantity;
                }
            }
        }

        const vat = scorporaVenditaFloreale({ grossCents, accessoryCents });
        const stripeMove = stripeByOrderId.get(order.id);
        const paypalMove =
            paypalByOrderId.get(order.id) ||
            (order.orderNumber ? paypalByOrderNumber.get(order.orderNumber) : undefined);

        let feeCents = order.stripeFee != null ? euroFloatToCents(order.stripeFee) : 0;
        let transactionId = order.stripeTransactionId || '';
        let paymentDate = order.createdAt;
        const gateway = resolveGatewayName({
            paymentMethodLabel: order.paymentMethodLabel,
            hasPaypalLedger: Boolean(paypalMove),
            hasStripeMovement: Boolean(stripeMove),
        });

        if (stripeMove && gateway === 'Stripe') {
            feeCents = stripeMove.feeCents > 0 ? stripeMove.feeCents : feeCents;
            transactionId =
                stripeMove.sourceId || stripeMove.stripeId || transactionId;
            paymentDate = stripeMove.createdAtStripe;
        } else if (paypalMove && gateway === 'PayPal') {
            feeCents = paypalMove.feeCents > 0 ? paypalMove.feeCents : feeCents;
            transactionId = paypalMove.transactionId || transactionId;
            paymentDate = paypalMove.paymentDate;
        }

        const netCents =
            order.netAmount != null
                ? euroFloatToCents(order.netAmount)
                : grossCents - feeCents;

        corrispettivi.push({
            orderId: order.id,
            orderNumber: order.orderNumber || order.id.slice(0, 8),
            date: order.createdAt.toISOString().slice(0, 10),
            paymentDate: paymentDate.toISOString().slice(0, 10),
            buyerName: order.buyerFullName || order.buyerEmail || 'Cliente',
            buyerTaxId: order.user?.vatNumber?.trim() || '',
            buyerCountry: order.buyerCountry?.trim() || 'IT',
            gateway,
            paymentMethod: order.paymentMethodLabel?.trim() || gateway,
            grossCents,
            imponibileCents: vat.imponibileCents,
            ivaDebitoCents: vat.ivaCents,
            vatRate: VAT_PCT_FLORAL,
            gatewayFeeCents: feeCents,
            netCents,
            transactionId,
        });
    }

    const stripeInvoicesDb = await prisma.stripeServiceInvoice.findMany({
        where: {
            OR: [
                { periodStart: { gte: bounds.start, lte: bounds.end } },
                { periodEnd: { gte: bounds.start, lte: bounds.end } },
                { issuedAt: { gte: bounds.start, lte: bounds.end } },
            ],
        },
        orderBy: { periodStart: 'asc' },
    });

    const stripeInvoices: StripeInvoiceRow[] = stripeInvoicesDb.map((inv) => ({
        id: inv.id,
        periodKey: inv.periodKey,
        number: inv.number || inv.periodKey,
        issuedAt: inv.issuedAt.toISOString().slice(0, 10),
        periodStart: inv.periodStart.toISOString().slice(0, 10),
        periodEnd: inv.periodEnd.toISOString().slice(0, 10),
        totalFeeCents: inv.totalFeeCents,
        taxableFeeCents: inv.taxableFeeCents,
        vatReverseChargeCents: inv.vatReverseChargeCents,
        vendorName: inv.vendorName,
        invoicePdfUrl: inv.invoicePdfUrl || inv.localPdfPath || null,
        hasPdf: Boolean(inv.invoicePdfUrl || inv.localPdfPath || inv.hostedInvoiceUrl),
    }));

    const paypalMonthlyFees = await buildPaypalMonthlyFeeRows({
        from: bounds.start,
        to: bounds.end,
    });

    const reverseCharge: ReverseChargeRow[] = [
        ...stripeInvoices.map((inv) => ({
            competenceMonth: inv.periodKey,
            vendorName: inv.vendorName || 'Stripe Payments Europe Ltd',
            vendorTaxId: STRIPE_VENDOR_TAX_ID,
            gatewayInvoiceNumber: inv.number,
            issuedAt: inv.issuedAt,
            taxableFeeCents: inv.taxableFeeCents || inv.totalFeeCents,
            vatReverseChargeCents:
                inv.vatReverseChargeCents ||
                Math.round(((inv.taxableFeeCents || inv.totalFeeCents) * VAT_PCT_ORDINARY) / 100),
            autofatturaTd17Ref:
                autofatturaRefs.get(inv.number.toUpperCase()) ||
                autofatturaRefs.get(inv.number) ||
                autofatturaRefs.get(inv.periodKey) ||
                '',
            source: 'stripe' as const,
        })),
        ...paypalMonthlyFees.map((inv) => ({
            competenceMonth: inv.periodKey,
            vendorName: inv.vendorName || PAYPAL_VENDOR_NAME,
            vendorTaxId: PAYPAL_VENDOR_TAX_ID,
            gatewayInvoiceNumber: inv.number,
            issuedAt: inv.issuedAt,
            taxableFeeCents: inv.taxableFeeCents,
            vatReverseChargeCents: inv.vatReverseChargeCents,
            autofatturaTd17Ref:
                autofatturaRefs.get(inv.number.toUpperCase()) ||
                autofatturaRefs.get(inv.number) ||
                autofatturaRefs.get(inv.periodKey) ||
                '',
            source: 'paypal' as const,
        })),
    ];

    const floristPassivo: FloristPassivoRow[] = orders
        .filter((o) => o.partnerId)
        .map((order) => {
            const compenso = resolveOrderFloristCompensationCents(order);
            const bankLine = bankLineByOrderId.get(order.id);
            const expense = expenseByOrderId.get(order.id);
            const expenseMeta = expense ? readExpenseMeta(expense.metadataJson) : {};
            const vatBreakdown = expense
                ? {
                      imponibileCents: Math.abs(expense.netCents || 0),
                      ivaCents: Math.abs(expense.vatCents || 0),
                      totaleCents: Math.abs(expense.totalCents || 0),
                  }
                : floristVatBreakdown(compenso, order.floristVatRate);

            const partnerTaxId =
                order.partner?.vatNumber?.trim() ||
                order.partner?.taxCode?.trim() ||
                null;

            return {
                orderId: order.id,
                orderNumber: order.orderNumber || order.id.slice(0, 8),
                partnerName:
                    order.partner?.shopName ||
                    order.partner?.ownerName ||
                    'Fiorista',
                partnerTaxId,
                partnerIban: order.partner?.iban?.trim() || null,
                compensoConcordatoCents: compenso,
                bonificoDate: bankLine?.accountingDate
                    ? bankLine.accountingDate.toISOString().slice(0, 10)
                    : bankLine?.valueDate
                      ? bankLine.valueDate.toISOString().slice(0, 10)
                      : null,
                bonificoTrn: bankLine ? extractBareFinecoTrn(bankLine.description) : null,
                sdiInvoiceNumber: expense
                    ? expenseInvoiceNumber(expenseMeta, expense.notes)
                    : null,
                sdiDate: expense
                    ? expense.expenseDate.toISOString().slice(0, 10)
                    : null,
                imponibilePassivoCents: vatBreakdown.imponibileCents,
                ivaPassivaCents: vatBreakdown.ivaCents,
                totaleFatturaCents: vatBreakdown.totaleCents || compenso,
            };
        });

    const floristLiquidazioni: FloristLiquidazioneRow[] = orders
        .filter((o) => o.partnerId)
        .map((order) => {
            const gross =
                order.grossAmount != null
                    ? euroFloatToCents(order.grossAmount)
                    : order.totalPriceCents;
            const compenso = resolveOrderFloristCompensationCents(order);
            const settled =
                order.floristSettlementStatus === 'BONIFICATO' ||
                order.floristSettlementStatus === 'RICEVUTA';
            return {
                orderId: order.id,
                orderNumber: order.orderNumber || order.id.slice(0, 8),
                date: order.createdAt.toISOString().slice(0, 10),
                partnerName:
                    order.partner?.shopName ||
                    order.partner?.ownerName ||
                    'Fiorista',
                partnerVat: order.partner?.vatNumber || null,
                grossOrderCents: gross,
                compensoConcordatoCents: compenso,
                paymentStatus: order.floristSettlementStatus,
                bonificoInviato: settled,
                fatturaPassivaStato:
                    order.floristSettlementStatus === 'RICEVUTA'
                        ? 'RICEVUTA / FATTURA PASSIVA'
                        : order.floristSettlementStatus === 'BONIFICATO'
                          ? 'BONIFICATO'
                          : 'PENDING',
            };
        });

    const reverseChargeImponibileCents = reverseCharge.reduce(
        (s, r) => s + r.taxableFeeCents,
        0
    );
    const reverseChargeIvaCents = reverseCharge.reduce(
        (s, r) => s + r.vatReverseChargeCents,
        0
    );
    const floristImponibileCents = floristPassivo.reduce(
        (s, r) => s + r.imponibilePassivoCents,
        0
    );
    const floristIvaCreditoCents = floristPassivo.reduce((s, r) => s + r.ivaPassivaCents, 0);

    const ivaDebitoVendite10Cents = corrispettivi.reduce((s, r) => s + r.ivaDebitoCents, 0);
    const saldoIvaStimatoCents = ivaDebitoVendite10Cents - floristIvaCreditoCents;

    const ivaSummary: IvaPeriodSummary = {
        corrispettiviLordoCents: corrispettivi.reduce((s, r) => s + r.grossCents, 0),
        imponibileVendite10Cents: corrispettivi.reduce((s, r) => s + r.imponibileCents, 0),
        ivaDebitoVendite10Cents,
        reverseChargeImponibileCents,
        reverseChargeIvaCents,
        floristImponibileCents,
        floristIvaCreditoCents,
        saldoIvaStimatoCents,
    };

    const summary = {
        corrispettiviLordoCents: ivaSummary.corrispettiviLordoCents,
        corrispettiviImponibileCents: ivaSummary.imponibileVendite10Cents,
        ivaDebito10Cents: ivaSummary.ivaDebitoVendite10Cents,
        gatewayFeesCents: corrispettivi.reduce((s, r) => s + r.gatewayFeeCents, 0),
        cashGatewayFeesCents: corrispettivi.reduce((s, r) => s + r.gatewayFeeCents, 0),
        cashNettoIncassatoCents: corrispettivi.reduce((s, r) => s + r.netCents, 0),
        stripeInvoicesTotalCents: stripeInvoices.reduce((s, r) => s + r.totalFeeCents, 0),
        paypalFeesTotalCents: paypalMonthlyFees.reduce((s, r) => s + r.totalFeeCents, 0),
        floristCompensiCents: floristPassivo.reduce(
            (s, r) => s + r.compensoConcordatoCents,
            0
        ),
        floristPaidCents: floristPassivo
            .filter((r) => r.bonificoDate)
            .reduce((s, r) => s + r.compensoConcordatoCents, 0),
        ivaCreditoFlorist10Cents: floristIvaCreditoCents,
    };

    return {
        bounds,
        summary,
        corrispettivi,
        reverseCharge,
        floristPassivo,
        ivaSummary,
        stripeInvoices,
        paypalMonthlyFees,
        floristLiquidazioni,
    };
}

/** CSV Excel IT: UTF-8 BOM + separatore `;`. */
export function buildTaxQuarterlyCsv(report: TaxQuarterlyReport): string {
    const lines: string[] = [];
    const sep = ';';
    const q = (v: string | number) => {
        const s = String(v ?? '');
        if (s.includes('"') || s.includes(sep) || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };
    const euro = (cents: number) => formatEuroFromCents(cents);

    lines.push(`Prospetto Fiscale FloreMoria${sep}${report.bounds.label}`);
    lines.push('');
    lines.push('=== RIEPILOGO ===');
    lines.push(['Voce', 'Importo EUR'].join(sep));
    lines.push(['Corrispettivi Lordo', euro(report.summary.corrispettiviLordoCents)].join(sep));
    lines.push(
        ['Imponibile IVA 10%', euro(report.summary.corrispettiviImponibileCents)].join(sep)
    );
    lines.push(['IVA a Debito 10%', euro(report.summary.ivaDebito10Cents)].join(sep));
    lines.push(['Commissioni Gateway', euro(report.summary.gatewayFeesCents)].join(sep));
    lines.push(
        ['Fatture Stripe (fee periodo)', euro(report.summary.stripeInvoicesTotalCents)].join(sep)
    );
    lines.push(
        ['Fee PayPal mensili (periodo)', euro(report.summary.paypalFeesTotalCents)].join(sep)
    );
    lines.push(
        ['Compensi Fioristi (concordati)', euro(report.summary.floristCompensiCents)].join(sep)
    );
    lines.push(
        ['Compensi Fioristi già bonificati', euro(report.summary.floristPaidCents)].join(sep)
    );

    lines.push('');
    lines.push('=== PROSPETTO CORRISPETTIVI (IVA 10%) ===');
    lines.push(
        [
            'Data',
            'Ordine',
            'Cliente',
            'Lordo EUR',
            'Imponibile EUR',
            'IVA 10% EUR',
            'Fee Gateway EUR',
            'Netto EUR',
            'ID Transazione',
        ].join(sep)
    );
    for (const r of report.corrispettivi) {
        lines.push(
            [
                q(r.date),
                q(r.orderNumber),
                q(r.buyerName),
                euro(r.grossCents),
                euro(r.imponibileCents),
                euro(r.ivaDebitoCents),
                euro(r.gatewayFeeCents),
                euro(r.netCents),
                q(r.transactionId),
            ].join(sep)
        );
    }

    lines.push('');
    lines.push('=== COSTI GATEWAY & FATTURE STRIPE (REVERSE CHARGE) ===');
    lines.push(
        [
            'Periodo',
            'Numero',
            'Emissione',
            'Dal',
            'Al',
            'Fee totale EUR',
            'Imponibile fee EUR',
            'IVA RC 22% EUR',
            'Fornitore',
            'PDF',
        ].join(sep)
    );
    for (const inv of report.stripeInvoices) {
        lines.push(
            [
                q(inv.periodKey),
                q(inv.number),
                q(inv.issuedAt),
                q(inv.periodStart),
                q(inv.periodEnd),
                euro(inv.totalFeeCents),
                euro(inv.taxableFeeCents),
                euro(inv.vatReverseChargeCents),
                q(inv.vendorName),
                q(inv.invoicePdfUrl || (inv.hasPdf ? 'SI' : 'NO')),
            ].join(sep)
        );
    }

    lines.push('');
    lines.push('=== COMMISSIONI PAYPAL MENSILI (REVERSE CHARGE STIMA) ===');
    lines.push(
        [
            'Periodo',
            'Numero',
            'Fine periodo',
            'N. TX',
            'Fee totale EUR',
            'Imponibile EUR',
            'IVA RC 22% EUR',
            'Fornitore',
        ].join(sep)
    );
    for (const inv of report.paypalMonthlyFees) {
        lines.push(
            [
                q(inv.periodKey),
                q(inv.number),
                q(inv.issuedAt),
                String(inv.txnCount),
                euro(inv.totalFeeCents),
                euro(inv.taxableFeeCents),
                euro(inv.vatReverseChargeCents),
                q(inv.vendorName),
            ].join(sep)
        );
    }

    lines.push('');
    lines.push('=== LIQUIDAZIONI FIORISTI ===');
    lines.push(
        [
            'Data',
            'Ordine',
            'Fiorista',
            'P.IVA',
            'Lordo ordine EUR',
            'Compenso concordato EUR',
            'Stato pagamento',
            'Bonifico inviato',
            'Stato fattura passiva',
        ].join(sep)
    );
    for (const f of report.floristLiquidazioni) {
        lines.push(
            [
                q(f.date),
                q(f.orderNumber),
                q(f.partnerName),
                q(f.partnerVat || ''),
                euro(f.grossOrderCents),
                euro(f.compensoConcordatoCents),
                q(f.paymentStatus),
                f.bonificoInviato ? 'SI' : 'NO',
                q(f.fatturaPassivaStato),
            ].join(sep)
        );
    }

    return `\uFEFF${lines.join('\r\n')}\r\n`;
}
