/**
 * Registro economico unificato: corrispettivi + liquidazioni fioristi, riga per ordine.
 * Compenso fiorista = Order.floristCompensationCents oppure stessa fonte Vera (listino / note).
 */

import type { FloristSettlementStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
    isAccessoryCategory,
    scorporaVenditaFloreale,
} from '@/lib/financial/vat';
import {
    resolveFinancePeriod,
    type FinancePeriodBounds,
    type FinancePeriodMode,
} from '@/lib/financial/financePeriod';
import { calculateFloristCompensation } from '@/lib/pricing/calculateFloristCompensation';

export type TaxRegisterRow = {
    orderId: string;
    date: string;
    orderNumber: string;
    buyerName: string;
    grossCents: number;
    floralImponibileCents: number;
    accessoryImponibileCents: number;
    accessoryGrossCents: number;
    ivaDebitoCents: number;
    gatewayLabel: string;
    gatewayFeeCents: number;
    floristName: string;
    floristCompensationCents: number;
    floristVatRate: number | null;
    settlementStatus: FloristSettlementStatus;
    netMarginCents: number;
    financeNotes: string | null;
    hasReceipt: boolean;
};

export type TaxRegisterReport = {
    bounds: FinancePeriodBounds;
    summary: {
        grossCents: number;
        floralImponibileCents: number;
        accessoryImponibileCents: number;
        ivaDebitoCents: number;
        gatewayFeeCents: number;
        floristCompensationCents: number;
        floristBonificatoCents: number;
        netMarginCents: number;
        rowCount: number;
        receiptCount: number;
    };
    rows: TaxRegisterRow[];
};

function accessoryGrossFromOrder(order: {
    accessoryAmountCents: number | null;
    items: Array<{
        priceCents: number;
        quantity: number;
        product: { category?: { slug: string; name: string } | null };
    }>;
}): number {
    if (order.accessoryAmountCents != null) {
        return Math.max(0, order.accessoryAmountCents);
    }
    let accessoryCents = 0;
    for (const item of order.items) {
        const cat = item.product?.category;
        if (isAccessoryCategory(cat?.slug) || isAccessoryCategory(cat?.name)) {
            accessoryCents += item.priceCents * item.quantity;
        }
    }
    return accessoryCents;
}

export function resolveOrderFloristCompensationCents(order: {
    floristCompensationCents: number | null;
    items: Parameters<typeof calculateFloristCompensation>[0];
    partner?: { internalNotes?: string | null } | null;
}): number {
    if (order.floristCompensationCents != null && order.floristCompensationCents >= 0) {
        return order.floristCompensationCents;
    }
    return calculateFloristCompensation(
        order.items,
        order.partner?.internalNotes
    ).totalCents;
}

export function formatGatewayFeeLabel(params: {
    paymentMethodLabel: string | null;
    feeCents: number;
}): string {
    const method = (params.paymentMethodLabel || 'Stripe').trim() || 'Stripe';
    const fee = (params.feeCents / 100).toFixed(2).replace('.', ',');
    return `${method} · fee €${fee}`;
}

export async function buildTaxRegisterReport(params: {
    year: number;
    mode?: FinancePeriodMode | string | null;
    quarter?: number | null;
    quadrimester?: number | null;
}): Promise<TaxRegisterReport> {
    const bounds = resolveFinancePeriod(params);

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
            customerReceipts: {
                select: {
                    id: true,
                    grossCents: true,
                    floralImponibileCents: true,
                    accessoryImponibileCents: true,
                    ivaDebitoCents: true,
                },
                take: 1,
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    const rows: TaxRegisterRow[] = [];
    for (const order of orders) {
        const receipt = order.customerReceipts[0] || null;
        const grossCents =
            receipt?.grossCents ??
            (order.grossAmount != null
                ? Math.round(order.grossAmount * 100)
                : order.totalPriceCents);
        const accessoryGrossCents = Math.min(
            accessoryGrossFromOrder(order),
            Math.abs(grossCents)
        );
        const vat = scorporaVenditaFloreale({
            grossCents,
            accessoryCents: accessoryGrossCents,
        });
        // Preferisci importi della ricevuta cliente effettivamente trasmessa
        const floralImponibileCents =
            receipt?.floralImponibileCents ?? vat.floral.imponibileCents;
        const accessoryImponibileCents =
            receipt?.accessoryImponibileCents ?? vat.accessory?.imponibileCents ?? 0;
        const ivaDebitoCents = receipt?.ivaDebitoCents ?? vat.ivaCents;
        const feeCents =
            order.stripeFee != null ? Math.round(order.stripeFee * 100) : 0;
        const floristCompensationCents = resolveOrderFloristCompensationCents(order);
        const netMarginCents = grossCents - feeCents - floristCompensationCents;

        rows.push({
            orderId: order.id,
            date: order.createdAt.toISOString().slice(0, 10),
            orderNumber: order.orderNumber || order.id.slice(0, 8),
            buyerName: order.buyerFullName || order.buyerEmail || 'Cliente',
            grossCents,
            floralImponibileCents,
            accessoryImponibileCents,
            accessoryGrossCents,
            ivaDebitoCents,
            gatewayLabel: formatGatewayFeeLabel({
                paymentMethodLabel: order.paymentMethodLabel,
                feeCents,
            }),
            gatewayFeeCents: feeCents,
            floristName:
                order.partner?.shopName ||
                order.partner?.ownerName ||
                (order.partnerId ? 'Fiorista' : '—'),
            floristCompensationCents,
            floristVatRate: order.floristVatRate,
            settlementStatus: order.floristSettlementStatus,
            netMarginCents,
            financeNotes: order.financeNotes,
            hasReceipt: Boolean(receipt),
        });
    }

    const summary = {
        grossCents: rows.reduce((s, r) => s + r.grossCents, 0),
        floralImponibileCents: rows.reduce((s, r) => s + r.floralImponibileCents, 0),
        accessoryImponibileCents: rows.reduce((s, r) => s + r.accessoryImponibileCents, 0),
        ivaDebitoCents: rows.reduce((s, r) => s + r.ivaDebitoCents, 0),
        gatewayFeeCents: rows.reduce((s, r) => s + r.gatewayFeeCents, 0),
        floristCompensationCents: rows.reduce((s, r) => s + r.floristCompensationCents, 0),
        floristBonificatoCents: rows
            .filter((r) => r.settlementStatus === 'BONIFICATO' || r.settlementStatus === 'RICEVUTA')
            .reduce((s, r) => s + r.floristCompensationCents, 0),
        netMarginCents: rows.reduce((s, r) => s + r.netMarginCents, 0),
        rowCount: rows.length,
        receiptCount: rows.filter((r) => r.hasReceipt).length,
    };

    return { bounds, summary, rows };
}

const SETTLEMENT_VALUES = new Set(['PENDING', 'BONIFICATO', 'RICEVUTA']);

export type TaxRegisterPatchInput = {
    orderId: string;
    floristCompensationCents?: number | null;
    floristVatRate?: number | null;
    floristSettlementStatus?: FloristSettlementStatus | string | null;
    accessoryAmountCents?: number | null;
    financeNotes?: string | null;
    paymentMethodLabel?: string | null;
    /** Forza lordo ordine (centesimi) → Order.grossAmount */
    grossCents?: number | null;
    /** Forza fee gateway (centesimi) → Order.stripeFee */
    gatewayFeeCents?: number | null;
};

export async function patchTaxRegisterRow(
    input: TaxRegisterPatchInput
): Promise<TaxRegisterRow> {
    const orderId = input.orderId?.trim();
    if (!orderId) throw new Error('orderId obbligatorio');

    const data: {
        floristCompensationCents?: number | null;
        floristVatRate?: number | null;
        floristSettlementStatus?: FloristSettlementStatus;
        accessoryAmountCents?: number | null;
        financeNotes?: string | null;
        paymentMethodLabel?: string | null;
        grossAmount?: number | null;
        stripeFee?: number | null;
    } = {};

    if (input.floristCompensationCents !== undefined) {
        const v = input.floristCompensationCents;
        if (v != null && (!Number.isFinite(v) || v < 0)) {
            throw new Error('Compenso fiorista non valido');
        }
        data.floristCompensationCents = v == null ? null : Math.round(v);
    }
    if (input.floristVatRate !== undefined) {
        const v = input.floristVatRate;
        if (v != null && (!Number.isFinite(v) || v < 0 || v > 1)) {
            throw new Error('Aliquota IVA fiorista non valida (0–1)');
        }
        data.floristVatRate = v;
    }
    if (input.floristSettlementStatus !== undefined && input.floristSettlementStatus != null) {
        const st = String(input.floristSettlementStatus).toUpperCase();
        if (!SETTLEMENT_VALUES.has(st)) {
            throw new Error('Stato liquidazione non valido');
        }
        data.floristSettlementStatus = st as FloristSettlementStatus;
    }
    if (input.accessoryAmountCents !== undefined) {
        const v = input.accessoryAmountCents;
        if (v != null && (!Number.isFinite(v) || v < 0)) {
            throw new Error('Importo accessori non valido');
        }
        data.accessoryAmountCents = v == null ? null : Math.round(v);
    }
    if (input.financeNotes !== undefined) {
        data.financeNotes = input.financeNotes?.trim() || null;
    }
    if (input.paymentMethodLabel !== undefined) {
        data.paymentMethodLabel = input.paymentMethodLabel?.trim().slice(0, 64) || null;
    }
    if (input.grossCents !== undefined) {
        const v = input.grossCents;
        if (v != null && (!Number.isFinite(v) || v < 0)) {
            throw new Error('Lordo non valido');
        }
        data.grossAmount = v == null ? null : Math.round(v) / 100;
    }
    if (input.gatewayFeeCents !== undefined) {
        const v = input.gatewayFeeCents;
        if (v != null && (!Number.isFinite(v) || v < 0)) {
            throw new Error('Fee gateway non valida');
        }
        data.stripeFee = v == null ? null : Math.round(v) / 100;
    }

    if (Object.keys(data).length === 0) {
        throw new Error('Nessun campo da aggiornare');
    }

    await prisma.order.update({ where: { id: orderId }, data });

    const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
            partner: {
                select: { shopName: true, ownerName: true, internalNotes: true },
            },
            items: {
                include: {
                    product: {
                        include: { category: { select: { slug: true, name: true } } },
                    },
                },
            },
            customerReceipts: {
                select: {
                    id: true,
                    grossCents: true,
                    floralImponibileCents: true,
                    accessoryImponibileCents: true,
                    ivaDebitoCents: true,
                },
                take: 1,
            },
        },
    });

    const receipt = order.customerReceipts[0] || null;
    const grossCents =
        receipt?.grossCents ??
        (order.grossAmount != null
            ? Math.round(order.grossAmount * 100)
            : order.totalPriceCents);
    const accessoryGrossCents = Math.min(
        accessoryGrossFromOrder(order),
        Math.abs(grossCents)
    );
    const vat = scorporaVenditaFloreale({
        grossCents,
        accessoryCents: accessoryGrossCents,
    });
    const feeCents = order.stripeFee != null ? Math.round(order.stripeFee * 100) : 0;
    const floristCompensationCents = resolveOrderFloristCompensationCents(order);

    return {
        orderId: order.id,
        date: order.createdAt.toISOString().slice(0, 10),
        orderNumber: order.orderNumber || order.id.slice(0, 8),
        buyerName: order.buyerFullName || order.buyerEmail || 'Cliente',
        grossCents,
        floralImponibileCents: receipt?.floralImponibileCents ?? vat.floral.imponibileCents,
        accessoryImponibileCents:
            receipt?.accessoryImponibileCents ?? vat.accessory?.imponibileCents ?? 0,
        accessoryGrossCents,
        ivaDebitoCents: receipt?.ivaDebitoCents ?? vat.ivaCents,
        gatewayLabel: formatGatewayFeeLabel({
            paymentMethodLabel: order.paymentMethodLabel,
            feeCents,
        }),
        gatewayFeeCents: feeCents,
        floristName:
            order.partner?.shopName ||
            order.partner?.ownerName ||
            (order.partnerId ? 'Fiorista' : '—'),
        floristCompensationCents,
        floristVatRate: order.floristVatRate,
        settlementStatus: order.floristSettlementStatus,
        netMarginCents: grossCents - feeCents - floristCompensationCents,
        financeNotes: order.financeNotes,
        hasReceipt: Boolean(receipt),
    };
}
