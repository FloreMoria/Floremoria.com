/**
 * Registro corrispettivi — METODO §8: costruito dagli **incassi gateway** (fonte §2).
 * Stati aliquota: determinata | presunta | mancante (§8.3). Nessuno stato «mista».
 * Importo: sempre lordo cliente (§8.2).
 */
import prisma from '@/lib/prisma';
import { scorporaIva, VAT_PCT_FLORAL } from '@/lib/financial/vat';
import type { DossierExceptionRow } from '@/lib/financial/dossierAcquistiBuild';
import { classifyPaypalGatewayMovement } from '@/lib/financial/paypalClassify';
import { parsePaypalSourceKey } from '@/lib/financial/paypalSourceKeys';

export type CorrispettivoVatCertainty = 'DETERMINATA' | 'PRESUNTA' | 'MANCANTE';

export type DossierCorrispettivoRow = {
    date: string;
    canaleIncasso: string;
    transactionId: string;
    orderNumber: string;
    orderId: string | null;
    grossCents: number;
    vatRate: number;
    vatCertainty: CorrispettivoVatCertainty;
    vatRuleNote: string;
    imponibileCents: number;
    ivaCents: number;
};

const EU_PRESUNTA_CUTOFF = new Date('2026-07-02T00:00:00.000Z');

function productVatRate(vatRatePercent: number | null | undefined): number | null {
    if (vatRatePercent === 10 || vatRatePercent === 22) return vatRatePercent;
    if (vatRatePercent == null || !Number.isFinite(vatRatePercent)) return null;
    const n = Math.round(vatRatePercent > 0 && vatRatePercent <= 1 ? vatRatePercent * 100 : vatRatePercent);
    return n === 10 || n === 22 ? n : null;
}

function isEuChannel(blob: string, paymentDate: Date): boolean {
    if (paymentDate >= EU_PRESUNTA_CUTOFF) return false;
    return /floremoria\.eu|stripe_eu|\.eu\b|psa|san\s*marco/i.test(blob);
}

type OrderWithItems = {
    id: string;
    orderNumber: string | null;
    totalPriceCents: number;
    paymentMethodLabel: string | null;
    stripeTransactionId: string | null;
    items: Array<{
        quantity: number;
        priceCents: number;
        product: { vatRatePercent: number | null; name: string | null } | null;
    }>;
};

function splitByProductVat(
    order: OrderWithItems,
    grossCents: number
): Array<{ rate: number; grossCents: number }> | null {
    const byRate = new Map<number, number>();
    for (const it of order.items) {
        const line = it.priceCents * it.quantity;
        if (line <= 0) continue;
        const rate = productVatRate(it.product?.vatRatePercent ?? null);
        if (rate == null) return null;
        byRate.set(rate, (byRate.get(rate) || 0) + line);
    }
    if (byRate.size === 0) return null;
    const listino = [...byRate.values()].reduce((a, b) => a + b, 0) || 1;
    const sign = grossCents < 0 ? -1 : 1;
    const abs = Math.abs(grossCents);
    return [...byRate.entries()].map(([rate, share]) => ({
        rate,
        grossCents: sign * Math.round((abs * share) / listino),
    }));
}

type GatewayIncasso = {
    gateway: 'Stripe' | 'PayPal';
    transactionId: string;
    grossCents: number;
    paymentDate: Date;
    orderId: string | null;
    channelBlob: string;
    isEu: boolean;
};

async function loadStripeIncassi(start: Date, end: Date): Promise<GatewayIncasso[]> {
    const rows = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: start, lte: end },
            type: { in: ['charge', 'payment', 'payment_refund', 'refund'] },
        },
        select: {
            stripeId: true,
            sourceId: true,
            type: true,
            amountCents: true,
            createdAtStripe: true,
            orderId: true,
            reportingCategory: true,
            description: true,
            metadataJson: true,
        },
        take: 5000,
    });

    const out: GatewayIncasso[] = [];
    for (const r of rows) {
        const t = (r.type || '').toLowerCase();
        const isRefund = t.includes('refund');
        // amountCents Stripe: charge positivo tipico; refund negativo
        let gross = r.amountCents;
        if (!isRefund && gross < 0) gross = Math.abs(gross);
        if (isRefund && gross > 0) gross = -gross;
        if (gross === 0) continue;
        // Escludi fee-only / payout-like
        if (/fee|payout|transfer|adjustment/i.test(r.reportingCategory || '')) continue;

        const txId = (r.sourceId || r.stripeId || '').trim();
        if (!txId) continue;
        const blob = `${r.stripeId} ${r.sourceId || ''} ${r.description || ''} ${JSON.stringify(r.metadataJson || {})}`;
        out.push({
            gateway: 'Stripe',
            transactionId: txId,
            grossCents: gross,
            paymentDate: r.createdAtStripe,
            orderId: r.orderId,
            channelBlob: blob,
            isEu: /stripe_eu/i.test(r.stripeId) || isEuChannel(blob, r.createdAtStripe),
        });
    }
    return out;
}

async function loadPaypalIncassi(start: Date, end: Date): Promise<GatewayIncasso[]> {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'PAYPAL_' },
            accountingDate: { gte: start, lte: end },
        },
        select: {
            sourceKey: true,
            orderId: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            metadataJson: true,
            category: true,
            direction: true,
        },
        take: 5000,
    });

    const out: GatewayIncasso[] = [];
    for (const r of rows) {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const classified = classifyPaypalGatewayMovement({
            description: r.description || '',
            grossCents: r.totalCents,
            feeCents: typeof meta.feeCents === 'number' ? meta.feeCents : undefined,
            eventCode: typeof meta.eventCode === 'string' ? meta.eventCode : null,
            payerEmail: typeof meta.payerEmail === 'string' ? meta.payerEmail : null,
            counterpartyName:
                typeof meta.counterpartyName === 'string' ? meta.counterpartyName : null,
        });
        if (classified.movementKind !== 'incasso' && classified.movementKind !== 'rimborso') {
            continue;
        }
        // Preferisci gross da metadata se presente (lordo), altrimenti |totalCents|
        const metaGross =
            typeof meta.grossCents === 'number'
                ? meta.grossCents
                : typeof meta.amountCents === 'number'
                  ? meta.amountCents
                  : null;
        let gross =
            metaGross != null && Number.isFinite(metaGross)
                ? Math.round(metaGross)
                : Math.abs(r.totalCents || 0);
        if (classified.movementKind === 'rimborso') gross = -Math.abs(gross);
        else if (r.direction === 'USCITA' && classified.movementKind === 'incasso') {
            continue;
        }
        if (gross === 0) continue;

        const parsed = parsePaypalSourceKey(r.sourceKey);
        const txId =
            (typeof meta.transactionId === 'string' && meta.transactionId) ||
            parsed?.transactionId ||
            r.sourceKey.replace(/^PAYPAL_/, '');
        const date = r.accountingDate || new Date();
        const blob = `${r.description || ''} ${r.sourceKey} ${JSON.stringify(meta)}`;
        out.push({
            gateway: 'PayPal',
            transactionId: txId,
            grossCents: gross,
            paymentDate: date,
            orderId: r.orderId,
            channelBlob: blob,
            isEu: isEuChannel(blob, date),
        });
    }
    return out;
}

/**
 * Costruisce il registro corrispettivi del periodo a partire dagli incassi Stripe/PayPal.
 */
export async function buildGatewayCorrispettivi(params: {
    start: Date;
    end: Date;
}): Promise<{
    rows: DossierCorrispettivoRow[];
    exceptions: DossierExceptionRow[];
    totals: {
        determinataGrossCents: number;
        presuntaGrossCents: number;
        mancanteGrossCents: number;
        ivaDebitoCents: number;
        imponibileCents: number;
        grossAllCents: number;
        mancanteShare: number;
    };
}> {
    const [stripe, paypal] = await Promise.all([
        loadStripeIncassi(params.start, params.end),
        loadPaypalIncassi(params.start, params.end),
    ]);

    // Dedup per transactionId (stesso incasso visto due volte)
    const byTx = new Map<string, GatewayIncasso>();
    for (const g of [...stripe, ...paypal]) {
        const key = `${g.gateway}:${g.transactionId}`.toLowerCase();
        const prev = byTx.get(key);
        if (!prev || Math.abs(g.grossCents) > Math.abs(prev.grossCents)) {
            byTx.set(key, g);
        }
    }
    const incassi = [...byTx.values()].sort(
        (a, b) => a.paymentDate.getTime() - b.paymentDate.getTime()
    );

    const orderIds = [...new Set(incassi.map((i) => i.orderId).filter(Boolean))] as string[];
    const orders =
        orderIds.length > 0
            ? await prisma.order.findMany({
                  where: { id: { in: orderIds }, deletedAt: null },
                  select: {
                      id: true,
                      orderNumber: true,
                      totalPriceCents: true,
                      paymentMethodLabel: true,
                      stripeTransactionId: true,
                      items: {
                          select: {
                              quantity: true,
                              priceCents: true,
                              product: { select: { vatRatePercent: true, name: true } },
                          },
                      },
                  },
              })
            : [];
    const orderById = new Map(orders.map((o) => [o.id, o]));

    // Match secondario: stripeTransactionId / orderNumber in description
    const orphans = incassi.filter((i) => !i.orderId || !orderById.has(i.orderId));
    if (orphans.length > 0) {
        const txIds = orphans.map((o) => o.transactionId).filter(Boolean);
        const extra = await prisma.order.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { stripeTransactionId: { in: txIds } },
                    ...orphans
                        .filter((o) => o.transactionId.length >= 8)
                        .slice(0, 50)
                        .map((o) => ({
                            orderNumber: { contains: o.transactionId.slice(0, 12), mode: 'insensitive' as const },
                        })),
                ],
            },
            select: {
                id: true,
                orderNumber: true,
                totalPriceCents: true,
                paymentMethodLabel: true,
                stripeTransactionId: true,
                items: {
                    select: {
                        quantity: true,
                        priceCents: true,
                        product: { select: { vatRatePercent: true, name: true } },
                    },
                },
            },
            take: 500,
        });
        for (const o of extra) {
            orderById.set(o.id, o);
            for (const g of orphans) {
                if (g.orderId) continue;
                if (o.stripeTransactionId && o.stripeTransactionId === g.transactionId) {
                    g.orderId = o.id;
                }
            }
        }
    }

    const rows: DossierCorrispettivoRow[] = [];
    const exceptions: DossierExceptionRow[] = [];

    for (const g of incassi) {
        const order = g.orderId ? orderById.get(g.orderId) : undefined;
        const orderNumber = order?.orderNumber || '';
        const date = g.paymentDate.toISOString().slice(0, 10);

        // FF-PD-26-002: eccezione alla presunzione .eu (accessorio) — se non c'è ordine con aliquote, mancante
        const isFfPdAccessory =
            /FF-PD-26-002/i.test(orderNumber) || /FF-PD-26-002/i.test(g.channelBlob);

        if (order) {
            const splits = splitByProductVat(order, g.grossCents);
            if (splits) {
                for (const s of splits) {
                    const vat = scorporaIva(s.grossCents, s.rate);
                    rows.push({
                        date,
                        canaleIncasso: g.gateway,
                        transactionId: g.transactionId,
                        orderNumber,
                        orderId: order.id,
                        grossCents: vat.grossCents,
                        vatRate: s.rate,
                        vatCertainty: 'DETERMINATA',
                        vatRuleNote: 'Aliquota da Product.vatRatePercent sulla riga ordine',
                        imponibileCents: vat.imponibileCents,
                        ivaCents: vat.ivaCents,
                    });
                }
                continue;
            }
        }

        if (g.isEu && !isFfPdAccessory) {
            const vat = scorporaIva(g.grossCents, VAT_PCT_FLORAL);
            rows.push({
                date,
                canaleIncasso: g.gateway,
                transactionId: g.transactionId,
                orderNumber: orderNumber || '',
                orderId: order?.id ?? null,
                grossCents: vat.grossCents,
                vatRate: VAT_PCT_FLORAL,
                vatCertainty: 'PRESUNTA',
                vatRuleNote:
                    'METODO §8.3 — canale .eu fino al 01/07/2026 aliquota 10% (regola documentata)',
                imponibileCents: vat.imponibileCents,
                ivaCents: vat.ivaCents,
            });
            continue;
        }

        exceptions.push({
            cosa: `Incasso senza aliquota determinabile — ${g.gateway} ${g.transactionId}`,
            dove: 'Corrispettivi',
            importoCents: Math.abs(g.grossCents),
            perche: order
                ? 'Ordine collegato ma prodotti senza vatRatePercent compilato: escluso dai totali IVA.'
                : 'Incasso gateway senza ordine collegato e senza regola di presunzione applicabile.',
        });
        rows.push({
            date,
            canaleIncasso: g.gateway,
            transactionId: g.transactionId,
            orderNumber: orderNumber || '',
            orderId: order?.id ?? null,
            grossCents: g.grossCents,
            vatRate: 0,
            vatCertainty: 'MANCANTE',
            vatRuleNote: 'Escluso dai totali IVA — vedi foglio Da chiarire',
            imponibileCents: 0,
            ivaCents: 0,
        });
    }

    const totals = {
        determinataGrossCents: 0,
        presuntaGrossCents: 0,
        mancanteGrossCents: 0,
        ivaDebitoCents: 0,
        imponibileCents: 0,
        grossAllCents: 0,
        mancanteShare: 0,
    };
    for (const r of rows) {
        const g = Math.abs(r.grossCents);
        totals.grossAllCents += g;
        if (r.vatCertainty === 'DETERMINATA') totals.determinataGrossCents += g;
        else if (r.vatCertainty === 'PRESUNTA') totals.presuntaGrossCents += g;
        else totals.mancanteGrossCents += g;
        if (r.vatCertainty !== 'MANCANTE') {
            totals.imponibileCents += r.imponibileCents;
            totals.ivaDebitoCents += r.ivaCents;
        }
    }
    totals.mancanteShare =
        totals.grossAllCents > 0 ? totals.mancanteGrossCents / totals.grossAllCents : 0;

    return { rows, exceptions, totals };
}

export function summarizeCorrispettiviVatCertainty(rows: DossierCorrispettivoRow[]) {
    const out = {
        determinataGrossCents: 0,
        presuntaGrossCents: 0,
        mancanteGrossCents: 0,
        ivaDebitoCents: 0,
        imponibileCents: 0,
    };
    for (const r of rows) {
        const g = Math.abs(r.grossCents);
        if (r.vatCertainty === 'MANCANTE') {
            out.mancanteGrossCents += g;
            continue;
        }
        if (r.vatCertainty === 'DETERMINATA') out.determinataGrossCents += g;
        if (r.vatCertainty === 'PRESUNTA') out.presuntaGrossCents += g;
        out.imponibileCents += r.imponibileCents;
        out.ivaDebitoCents += r.ivaCents;
    }
    return out;
}
