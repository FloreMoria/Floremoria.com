/**
 * Registro globale compensi fioristi — tutti gli ordini con fiorista/compenso.
 * Stato documento fiscale persistito in Order.veraWorkflowFlags.floristDocStatus
 * (solo Contabilità; mai GdM/bacheche).
 */

import prisma from '@/lib/prisma';
import {
    FLORIST_DOC_STATUS_LABELS,
    orderReferenceDate,
    resolveFloristDocStatus,
    type FloristCompensationRow,
    type FloristDocStatus,
} from '@/lib/financial/floristDocStatus';

export type {
    FloristCompensationRow,
    FloristDocStatus,
} from '@/lib/financial/floristDocStatus';
export {
    FLORIST_DOC_STATUSES,
    FLORIST_DOC_STATUS_LABELS,
    isFloristDocStatus,
    resolveFloristDocStatus,
    orderReferenceDate,
} from '@/lib/financial/floristDocStatus';

function toDateOnlyIso(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
    const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
}

function readFlags(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') return {};
    return { ...(raw as Record<string, unknown>) };
}

/**
 * Elenco completo ordini con partner + compenso fiorista > 0 (anno fiscale corrente).
 */
export async function listFloristCompensationRegister(): Promise<FloristCompensationRow[]> {
    const now = new Date();
    const year = now.getFullYear();
    const lookback = new Date(Date.UTC(year, 0, 1, 0, 0, 0));

    const orders = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            partnerId: { not: null },
            floristCompensationCents: { gt: 0 },
            createdAt: { gte: lookback },
        },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
            deliveryDate: true,
            floristCompensationCents: true,
            floristSettlementStatus: true,
            financeNotes: true,
            veraWorkflowFlags: true,
            partner: {
                select: {
                    id: true,
                    shopName: true,
                    ownerName: true,
                    vatNumber: true,
                    taxCode: true,
                    email: true,
                    whatsappNumber: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
    });

    const expenseIds = new Set<string>();
    for (const o of orders) {
        const flags = readFlags(o.veraWorkflowFlags);
        if (typeof flags.floristLinkedExpenseId === 'string') {
            expenseIds.add(flags.floristLinkedExpenseId);
        }
    }

    const expenses = expenseIds.size
        ? await prisma.manualFinanceExpense.findMany({
              where: { id: { in: [...expenseIds] } },
              select: { id: true, docType: true, blobUrl: true, blobPath: true },
          })
        : [];
    const expenseById = new Map(expenses.map((e) => [e.id, e]));

    const orderIds = orders.map((o) => o.id);
    const bankLines = orderIds.length
        ? await prisma.bankStatementLine.findMany({
              where: { matchedOrderId: { in: orderIds } },
              select: { id: true, documentId: true, matchedOrderId: true },
              take: 3000,
          })
        : [];
    const bankByOrder = new Map<string, { id: string; documentId: string }>();
    for (const line of bankLines) {
        if (!line.matchedOrderId) continue;
        if (!bankByOrder.has(line.matchedOrderId)) {
            bankByOrder.set(line.matchedOrderId, { id: line.id, documentId: line.documentId });
        }
    }

    const rows: FloristCompensationRow[] = [];
    for (const order of orders) {
        const partner = order.partner;
        if (!partner) continue;
        const flags = readFlags(order.veraWorkflowFlags);
        const linkedExpenseId =
            typeof flags.floristLinkedExpenseId === 'string'
                ? flags.floristLinkedExpenseId
                : null;
        const expense = linkedExpenseId ? expenseById.get(linkedExpenseId) : null;
        const docStatus = resolveFloristDocStatus({
            flags,
            floristSettlementStatus: order.floristSettlementStatus,
            linkedExpenseDocType: expense?.docType || null,
            orderStatus: order.status,
        });
        const refDate = orderReferenceDate(order, now);
        const bank = bankByOrder.get(order.id) || null;

        rows.push({
            id: `order-${order.id}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            partnerId: partner.id,
            partnerName: partner.shopName || partner.ownerName || 'Fiorista',
            partnerVat: partner.vatNumber || partner.taxCode || null,
            partnerEmail: partner.email || null,
            partnerWhatsapp: partner.whatsappNumber || null,
            orderDate: toDateOnlyIso(refDate),
            amountCents: order.floristCompensationCents || 0,
            daysSinceOrder: daysBetween(refDate, now),
            docStatus,
            statusLabel: FLORIST_DOC_STATUS_LABELS[docStatus],
            receiptUrl: expense?.blobUrl || null,
            receiptPath: expense?.blobPath || null,
            linkedExpenseId,
            linkedExpenseDocType: expense?.docType || null,
            notes: order.financeNotes || null,
            bankLineId: bank?.id || null,
            documentId: bank?.documentId || null,
            floristSettlementStatus: order.floristSettlementStatus,
        });
    }

    const rank: Record<FloristDocStatus, number> = {
        WAITING_INVOICE: 0,
        RECEIPT_ASSOCIATED: 1,
        INVOICE_ASSOCIATED: 2,
        NOT_DUE: 3,
        CANCELLED: 4,
    };
    rows.sort((a, b) => {
        const dr = rank[a.docStatus] - rank[b.docStatus];
        if (dr !== 0) return dr;
        return b.orderDate.localeCompare(a.orderDate);
    });

    return rows;
}

export async function countFloristWaitingDocuments(): Promise<number> {
    const rows = await listFloristCompensationRegister();
    return rows.filter((r) => r.docStatus === 'WAITING_INVOICE').length;
}
