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
} from '@/lib/financial/vat';
import { resolveOrderFloristCompensationCents } from '@/lib/financial/taxRegister';
import {
    buildPaypalMonthlyFeeRows,
    type PaypalMonthlyFeeRow,
} from '@/lib/financial/paypalMonthlyFees';

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

export type CorrispettivoRow = {
    orderId: string;
    orderNumber: string;
    date: string;
    buyerName: string;
    grossCents: number;
    imponibileCents: number;
    ivaDebitoCents: number;
    vatRate: number;
    gatewayFeeCents: number;
    netCents: number;
    transactionId: string;
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
    stripeInvoices: StripeInvoiceRow[];
    paypalMonthlyFees: PaypalMonthlyFeeRow[];
    floristLiquidazioni: FloristLiquidazioneRow[];
};

export async function buildTaxQuarterlyReport(
    year: number,
    quarter: TaxQuarter
): Promise<TaxQuarterlyReport> {
    const bounds = resolveQuarterBounds(year, quarter);

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
            partner: {
                select: {
                    shopName: true,
                    ownerName: true,
                    vatNumber: true,
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
        const feeCents =
            order.stripeFee != null ? euroFloatToCents(order.stripeFee) : 0;
        const netCents =
            order.netAmount != null
                ? euroFloatToCents(order.netAmount)
                : grossCents - feeCents;

        corrispettivi.push({
            orderId: order.id,
            orderNumber: order.orderNumber || order.id.slice(0, 8),
            date: order.createdAt.toISOString().slice(0, 10),
            buyerName: order.buyerFullName || order.buyerEmail || 'Cliente',
            grossCents,
            imponibileCents: vat.imponibileCents,
            ivaDebitoCents: vat.ivaCents,
            vatRate: VAT_PCT_FLORAL,
            gatewayFeeCents: feeCents,
            netCents,
            transactionId: order.stripeTransactionId || '',
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

    const summary = {
        corrispettiviLordoCents: corrispettivi.reduce((s, r) => s + r.grossCents, 0),
        corrispettiviImponibileCents: corrispettivi.reduce((s, r) => s + r.imponibileCents, 0),
        ivaDebito10Cents: corrispettivi.reduce((s, r) => s + r.ivaDebitoCents, 0),
        gatewayFeesCents: corrispettivi.reduce((s, r) => s + r.gatewayFeeCents, 0),
        /** Cassa gateway (fee trattenute) — non sono ricavi di vendita. */
        cashGatewayFeesCents: corrispettivi.reduce((s, r) => s + r.gatewayFeeCents, 0),
        /** Netto cassa atteso post-fee (binario A). */
        cashNettoIncassatoCents: corrispettivi.reduce((s, r) => s + r.netCents, 0),
        stripeInvoicesTotalCents: stripeInvoices.reduce((s, r) => s + r.totalFeeCents, 0),
        paypalFeesTotalCents: paypalMonthlyFees.reduce((s, r) => s + r.totalFeeCents, 0),
        floristCompensiCents: floristLiquidazioni.reduce(
            (s, r) => s + r.compensoConcordatoCents,
            0
        ),
        floristPaidCents: floristLiquidazioni
            .filter((r) => r.bonificoInviato)
            .reduce((s, r) => s + r.compensoConcordatoCents, 0),
        /** IVA a credito stimata 10% su compensi fioristi (fattura passiva tipica). */
        ivaCreditoFlorist10Cents: floristLiquidazioni.reduce(
            (s, r) => s + Math.abs(scorporaIvaFloreale(r.compensoConcordatoCents).ivaCents),
            0
        ),
    };

    return {
        bounds,
        summary,
        corrispettivi,
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
