/**
 * C11 lista di lavoro: pagamenti gateway senza ordine ↔ ordini senza pagamento.
 * Ancorata al pagamento (fatto certificato). Proposte ±7gg stesso importo; accept esplicito.
 */
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

export type PaymentWithoutOrderRow = {
    transactionId: string;
    date: string;
    channel: string;
    amountCents: number;
    proposals: Array<{
        orderId: string;
        orderNumber: string | null;
        orderDate: string;
        amountCents: number;
        dayDelta: number;
    }>;
};

export type OrderWithoutPaymentRow = {
    orderId: string;
    orderNumber: string | null;
    date: string;
    amountCents: number;
};

export type PaymentOrderWorkList = {
    title: 'C11 — Pagamenti ↔ ordini da collegare';
    kind: 'work_list';
    year: number;
    paymentsWithoutOrder: PaymentWithoutOrderRow[];
    ordersWithoutPayment: OrderWithoutPaymentRow[];
    plausiblePairCount: number;
    paymentsTotalCents: number;
    ordersTotalCents: number;
};

function dayMs(iso: string) {
    return Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
}

export async function buildPaymentOrderWorkList(
    year = new Date().getFullYear()
): Promise<PaymentOrderWorkList> {
    const gwRows: Array<{
        tx: string;
        date: string;
        channel: string;
        grossCents: number;
        orderId: string | null;
    }> = [];

    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(year, q);
        if (b.start > new Date()) continue;
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            gwRows.push({
                tx: r.transactionId,
                date: r.date,
                channel: r.canaleIncasso,
                grossCents: Math.abs(r.grossCents),
                orderId: r.orderId,
            });
        }
    }

    const paymentsWithoutOrderRaw = gwRows.filter((r) => !r.orderId);
    const linkedOrderIds = new Set(gwRows.filter((r) => r.orderId).map((r) => r.orderId!));

    const orders = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            createdAt: {
                gte: new Date(Date.UTC(year, 0, 1)),
                lt: new Date(Date.UTC(year + 1, 0, 1)),
            },
            status: { notIn: ['CANCELLED', 'PENDING'] },
            totalPriceCents: { gt: 0 },
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            createdAt: true,
            stripeTransactionId: true,
            isRecurring: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            paymentMethodLabel: true,
            additionalInstructions: true,
            financeNotes: true,
        },
    });

    const salesOrders = orders.filter((o) => !isPrepaidSubscriptionPoseOrder(o));
    const ordersWithoutPayment = salesOrders
        .filter((o) => !linkedOrderIds.has(o.id))
        .map((o) => ({
            orderId: o.id,
            orderNumber: o.orderNumber,
            date: o.createdAt.toISOString().slice(0, 10),
            amountCents: o.totalPriceCents,
        }));

    let plausiblePairCount = 0;
    const paymentsWithoutOrder: PaymentWithoutOrderRow[] = paymentsWithoutOrderRaw.map((p) => {
        const proposals = ordersWithoutPayment
            .filter((o) => o.amountCents === p.grossCents)
            .map((o) => {
                const dayDelta = Math.round((dayMs(p.date) - dayMs(o.date)) / 86400000);
                return { ...o, dayDelta };
            })
            .filter((o) => Math.abs(o.dayDelta) <= 7)
            .map((o) => ({
                orderId: o.orderId,
                orderNumber: o.orderNumber,
                orderDate: o.date,
                amountCents: o.amountCents,
                dayDelta: o.dayDelta,
            }));
        plausiblePairCount += proposals.length;
        return {
            transactionId: p.tx,
            date: p.date,
            channel: p.channel,
            amountCents: p.grossCents,
            proposals,
        };
    });

    return {
        title: 'C11 — Pagamenti ↔ ordini da collegare',
        kind: 'work_list',
        year,
        paymentsWithoutOrder,
        ordersWithoutPayment,
        plausiblePairCount,
        paymentsTotalCents: paymentsWithoutOrder.reduce((s, r) => s + r.amountCents, 0),
        ordersTotalCents: ordersWithoutPayment.reduce((s, r) => s + r.amountCents, 0),
    };
}

/**
 * Accetta una proposta: collega il pagamento gateway all'ordine.
 * Scrive solo su richiesta esplicita (niente auto-link).
 */
export async function acceptPaymentOrderLink(opts: {
    transactionId: string;
    channel: string;
    orderId: string;
}): Promise<{ ok: true; linkedVia: string } | { ok: false; error: string }> {
    const order = await prisma.order.findUnique({
        where: { id: opts.orderId },
        select: { id: true, orderNumber: true, stripeTransactionId: true },
    });
    if (!order) return { ok: false, error: 'Ordine non trovato' };

    const tx = opts.transactionId.trim();
    if (!tx) return { ok: false, error: 'transactionId mancante' };

    // Stripe: movement.orderId + Order.stripeTransactionId se vuoto
    const stripeMov = await prisma.stripeFinanceMovement.findFirst({
        where: {
            OR: [{ stripeId: tx }, { stripeId: { contains: tx } }],
        },
        select: { id: true, orderId: true, stripeId: true },
    });

    if (stripeMov) {
        if (stripeMov.orderId && stripeMov.orderId !== order.id) {
            return {
                ok: false,
                error: `Movimento Stripe già collegato a un altro ordine (${stripeMov.orderId.slice(0, 8)})`,
            };
        }
        await prisma.stripeFinanceMovement.update({
            where: { id: stripeMov.id },
            data: { orderId: order.id },
        });
        if (!order.stripeTransactionId) {
            await prisma.order.update({
                where: { id: order.id },
                data: { stripeTransactionId: stripeMov.stripeId || tx },
            });
        }
        return { ok: true, linkedVia: 'stripe_finance_movement' };
    }

    // PayPal: ledger entry con orderId
    const paypalLed = await prisma.financialLedgerEntry.findFirst({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { contains: tx } },
                { documentRef: tx },
                { description: { contains: tx } },
            ],
            AND: [
                {
                    OR: [
                        { sourceType: 'PAYPAL_MOVEMENT' },
                        { sourceKey: { startsWith: 'PAYPAL' } },
                    ],
                },
            ],
        },
        select: { id: true, orderId: true },
    });

    if (paypalLed) {
        if (paypalLed.orderId && paypalLed.orderId !== order.id) {
            return {
                ok: false,
                error: `Movimento PayPal già collegato a un altro ordine (${paypalLed.orderId.slice(0, 8)})`,
            };
        }
        await prisma.financialLedgerEntry.update({
            where: { id: paypalLed.id },
            data: { orderId: order.id, documentRef: order.orderNumber || paypalLed.id },
        });
        return { ok: true, linkedVia: 'paypal_ledger' };
    }

    // Fallback: imposta stripeTransactionId sull'ordine se il canale è Stripe
    if (/stripe/i.test(opts.channel) || tx.startsWith('ch_') || tx.startsWith('py_')) {
        await prisma.order.update({
            where: { id: order.id },
            data: { stripeTransactionId: tx },
        });
        return { ok: true, linkedVia: 'order.stripeTransactionId' };
    }

    return {
        ok: false,
        error: 'Movimento gateway non trovato per questo transactionId — nessun collegamento scritto',
    };
}
