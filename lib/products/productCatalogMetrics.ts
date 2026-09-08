/**
 * Quantità vendute per prodotto — calcolate dagli OrderItem, mai salvate sul Product.
 * Spec: METODO / brief prodotti — esclude annullati; rimborsi item-level non ancora modellati.
 */

import prisma from '@/lib/prisma';

export type SoldUnitsPeriod = 'year' | 'last12m' | 'all';

export function resolveSoldUnitsWindow(
    period: SoldUnitsPeriod,
    now = new Date()
): { start: Date | null; end: Date } {
    const end = now;
    if (period === 'all') return { start: null, end };
    if (period === 'year') {
        return { start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0), end };
    }
    // last 12 months
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    return { start, end };
}

/**
 * Σ quantity OrderItem su ordini non cancellati / non soft-deleted / non test.
 * Assunzione dichiarata: non esiste ancora una riga d'ordine negativa per rimborso
 * parziale; i rimborsi totali tipicamente portano status CANCELLED.
 */
export async function loadSoldUnitsByProductId(
    period: SoldUnitsPeriod = 'year'
): Promise<Map<string, number>> {
    const { start, end } = resolveSoldUnitsWindow(period);
    const groups = await prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
            order: {
                deletedAt: null,
                isTest: false,
                status: { not: 'CANCELLED' },
                ...(start
                    ? { createdAt: { gte: start, lte: end } }
                    : { createdAt: { lte: end } }),
            },
        },
        _sum: { quantity: true },
    });
    const map = new Map<string, number>();
    for (const g of groups) {
        map.set(g.productId, g._sum.quantity ?? 0);
    }
    return map;
}

/** Margine unitario in centesimi: prezzo scorporato IVA − costo standard. Null se manca aliquota o costo. */
export function unitMarginCents(params: {
    basePriceCents: number;
    vatRatePercent: number | null | undefined;
    floristStandardCostCents: number | null | undefined;
}): number | null {
    const vat = params.vatRatePercent;
    if (vat !== 10 && vat !== 22) return null;
    if (params.floristStandardCostCents == null) return null;
    const net = Math.round(params.basePriceCents / (1 + vat / 100));
    return net - params.floristStandardCostCents;
}
