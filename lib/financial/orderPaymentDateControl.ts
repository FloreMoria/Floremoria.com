/**
 * C12 — data ordine = data incasso cliente (±24h fuso).
 * Universo: tutti gli ordini dell’anno con evidenza gateway (stesso perimetro corrispettivi),
 * non solo quelli con paymentMethodLabel compilato.
 */
import prisma from '@/lib/prisma';
import { measureRevenuePerimeterSets } from '@/lib/financial/revenuePerimeterChannels';

const MS_24H = 24 * 60 * 60 * 1000;

export type OrderPaymentDateDivergence = {
    orderId: string;
    orderNumber: string | null;
    orderDate: string;
    paymentDate: string;
    gateway: 'stripe' | 'paypal';
    absDiffHours: number;
};

export type C12Exclusion = {
    orderId: string;
    orderNumber: string | null;
    reason: string;
};

function toIsoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function normalizeTxnToken(raw: string): string {
    return raw
        .trim()
        .replace(/^stripe_(?:com|eu)_tx_/i, '')
        .replace(/^stripe_tx_/i, '')
        .replace(/^TX:/i, '');
}

/**
 * Confronta createdAt ordine con data movimento gateway collegato.
 * Tolleranza dichiarata: |Δ| ≤ 24h (fuso) → non errore.
 */
export async function findOrderPaymentDateDivergences(year: number): Promise<{
    checked: number;
    timezoneToleranceHours: 24;
    universeSize: number;
    exclusions: C12Exclusion[];
    divergences: OrderPaymentDateDivergence[];
}> {
    const sets = await measureRevenuePerimeterSets(year);
    const corr = sets.find((c) => c.id === 'corrispettivi');
    const universeIds = corr?.orderIds || [];
    const universeSize = universeIds.length;

    if (universeSize === 0) {
        return {
            checked: 0,
            timezoneToleranceHours: 24,
            universeSize: 0,
            exclusions: [],
            divergences: [],
        };
    }

    const orders = await prisma.order.findMany({
        where: { id: { in: universeIds } },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            stripeTransactionId: true,
        },
    });

    const txTokens = [
        ...new Set(
            orders
                .map((o) => o.stripeTransactionId)
                .filter((t): t is string => Boolean(t?.trim()))
                .map(normalizeTxnToken)
        ),
    ];

    const [byOrderId, stripeAllYear, paypalByOrder, paypalByTx] = await Promise.all([
        prisma.stripeFinanceMovement.findMany({
            where: {
                orderId: { in: universeIds },
                type: { in: ['charge', 'payment'] },
            },
            select: {
                orderId: true,
                stripeId: true,
                createdAtStripe: true,
                sourceId: true,
                metadataJson: true,
            },
        }),
        txTokens.length
            ? prisma.stripeFinanceMovement.findMany({
                  where: {
                      type: { in: ['charge', 'payment'] },
                      OR: txTokens.flatMap((tok) => [
                          { stripeId: { contains: tok } },
                          { sourceId: { contains: tok } },
                      ]),
                  },
                  select: {
                      orderId: true,
                      stripeId: true,
                      createdAtStripe: true,
                      sourceId: true,
                      metadataJson: true,
                  },
                  take: 5000,
              })
            : Promise.resolve([]),
        prisma.financialLedgerEntry.findMany({
            where: {
                reversedAt: null,
                orderId: { in: universeIds },
                sourceType: 'PAYPAL_MOVEMENT',
                totalCents: { gt: 0 },
            },
            select: {
                orderId: true,
                accountingDate: true,
                sourceKey: true,
                totalCents: true,
            },
        }),
        txTokens.length
            ? prisma.financialLedgerEntry.findMany({
                  where: {
                      reversedAt: null,
                      sourceType: 'PAYPAL_MOVEMENT',
                      totalCents: { gt: 0 },
                      OR: txTokens.map((tok) => ({
                          sourceKey: { contains: tok },
                      })),
                  },
                  select: {
                      orderId: true,
                      accountingDate: true,
                      sourceKey: true,
                      totalCents: true,
                  },
                  take: 5000,
              })
            : Promise.resolve([]),
    ]);

    const stripeByOrder = new Map<string, Date>();
    const orderByToken = new Map<string, string>();
    for (const o of orders) {
        if (o.stripeTransactionId?.trim()) {
            orderByToken.set(normalizeTxnToken(o.stripeTransactionId), o.id);
        }
    }

    for (const m of [...byOrderId, ...stripeAllYear]) {
        if (!m.createdAtStripe) continue;
        let oid = m.orderId || null;
        if (!oid) {
            const blob = `${m.stripeId} ${m.sourceId || ''} ${JSON.stringify(m.metadataJson || {})}`;
            for (const [tok, id] of orderByToken) {
                if (tok.length >= 8 && blob.includes(tok)) {
                    oid = id;
                    break;
                }
            }
        }
        if (!oid || !universeIds.includes(oid)) continue;
        const prev = stripeByOrder.get(oid);
        if (!prev || m.createdAtStripe < prev) stripeByOrder.set(oid, m.createdAtStripe);
    }

    const paypalByOrderMap = new Map<string, Date>();
    for (const r of [...paypalByOrder, ...paypalByTx]) {
        let oid = r.orderId;
        if (!oid && r.sourceKey) {
            for (const [tok, id] of orderByToken) {
                if (tok.length >= 8 && r.sourceKey.includes(tok)) {
                    oid = id;
                    break;
                }
            }
        }
        if (!oid || !universeIds.includes(oid) || !r.accountingDate) continue;
        const prev = paypalByOrderMap.get(oid);
        if (!prev || r.accountingDate < prev) paypalByOrderMap.set(oid, r.accountingDate);
    }

    const divergences: OrderPaymentDateDivergence[] = [];
    const exclusions: C12Exclusion[] = [];
    let checked = 0;

    for (const o of orders) {
        const payDate = stripeByOrder.get(o.id) || paypalByOrderMap.get(o.id);
        if (!payDate) {
            exclusions.push({
                orderId: o.id,
                orderNumber: o.orderNumber,
                reason:
                    'In perimetro corrispettivi ma data incasso non risolvibile (TX non trovata in Stripe/PayPal store)',
            });
            continue;
        }
        checked += 1;
        const absDiff = Math.abs(o.createdAt.getTime() - payDate.getTime());
        if (absDiff <= MS_24H) continue;
        divergences.push({
            orderId: o.id,
            orderNumber: o.orderNumber,
            orderDate: toIsoDay(o.createdAt),
            paymentDate: toIsoDay(payDate),
            gateway: stripeByOrder.has(o.id) ? 'stripe' : 'paypal',
            absDiffHours: Math.round((absDiff / (60 * 60 * 1000)) * 10) / 10,
        });
    }

    divergences.sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    return {
        checked,
        timezoneToleranceHours: 24,
        universeSize,
        exclusions,
        divergences,
    };
}
