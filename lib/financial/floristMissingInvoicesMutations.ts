/**
 * Mutazioni atomiche per alert "Fatture non arrivate dai fioristi".
 *
 * Scontrini fiscali: SOLO Contabilità (ManualFinanceExpense).
 * Vietato scrivere su Order.photos / DeliveryProof / DeceasedProfile / GdM / bacheche.
 */

import prisma from '@/lib/prisma';
import { createManualExpense } from '@/lib/financial/manualExpenses';
import {
    mergeFloristAlertMeta,
    readFloristAlertMeta,
    type FloristAlertMeta,
} from '@/lib/financial/floristMissingInvoices';
import type { Prisma } from '@prisma/client';

function parseRowId(rowId: string): { kind: 'bank' | 'order'; id: string } | null {
    if (rowId.startsWith('bank-')) return { kind: 'bank', id: rowId.slice(5) };
    if (rowId.startsWith('order-')) return { kind: 'order', id: rowId.slice(6) };
    return null;
}

export async function linkFloristMissingOrder(input: {
    bankLineId?: string | null;
    documentId?: string | null;
    orderId: string;
    /** Se riga order-* senza bank line, aggiorna solo metadati ordine. */
    rowId?: string | null;
}): Promise<{ orderId: string; orderNumber: string | null }> {
    const orderId = input.orderId.trim();
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            orderNumber: true,
            floristCompensationCents: true,
            createdAt: true,
            partnerId: true,
        },
    });
    if (!order) throw new Error('Ordine non trovato.');

    const bankLineId = input.bankLineId?.trim() || null;
    const documentId = input.documentId?.trim() || null;

    if (bankLineId) {
        const line = await prisma.bankStatementLine.findFirst({
            where: documentId ? { id: bankLineId, documentId } : { id: bankLineId },
        });
        if (!line) throw new Error('Movimento bancario non trovato.');

        const payDate = line.accountingDate || line.valueDate;
        if (payDate && order.createdAt.getTime() - payDate.getTime() > 2 * 24 * 60 * 60 * 1000) {
            throw new Error(
                `Incongruenza date: l'ordine ${order.orderNumber || order.id} è stato creato dopo il bonifico. Associazione rifiutata.`
            );
        }

        await prisma.$transaction(async (tx) => {
            await tx.bankStatementLine.update({
                where: { id: line.id },
                data: {
                    matchedOrderId: order.id,
                    matchStatus: 'MATCHED',
                    matchType: line.matchType?.startsWith('FLORIST')
                        ? line.matchType
                        : 'FLORIST_TRANSFER',
                    matchScore: 100,
                    matchNotes: `Ordine associato da Contabilità: ${order.orderNumber || order.id}`,
                },
            });
            if (order.partnerId) {
                // no-op: partner già sull'ordine
            }
        });
    } else if (input.rowId?.startsWith('order-')) {
        // Riga già order-centric: conferma link (idempotente)
        await prisma.order.update({
            where: { id: order.id },
            data: {
                financeNotes: `Associazione contabilità fiorista confermata ${new Date().toISOString().slice(0, 10)}`,
            },
        });
    } else {
        throw new Error('bankLineId obbligatorio per associare un movimento bancario.');
    }

    return { orderId: order.id, orderNumber: order.orderNumber };
}

export async function linkFloristMissingExpense(input: {
    rowId: string;
    expenseId: string;
}): Promise<{ expenseId: string }> {
    const parsed = parseRowId(input.rowId);
    if (!parsed) throw new Error('rowId non valido.');

    const expense = await prisma.manualFinanceExpense.findUnique({
        where: { id: input.expenseId },
        select: { id: true },
    });
    if (!expense) throw new Error('Fattura/spesa passiva non trovata.');

    if (parsed.kind === 'bank') {
        const line = await prisma.bankStatementLine.findUnique({ where: { id: parsed.id } });
        if (!line) throw new Error('Movimento bancario non trovato.');
        const rawJson = mergeFloristAlertMeta(line.rawJson, { linkedExpenseId: expense.id });
        await prisma.$transaction([
            prisma.bankStatementLine.update({
                where: { id: line.id },
                data: {
                    rawJson: rawJson as Prisma.InputJsonValue,
                    matchStatus: 'MATCHED',
                    matchType: line.matchType || 'FLORIST_INVOICE',
                    matchNotes: `Fattura passiva associata da Contabilità: ${expense.id}`,
                },
            }),
            prisma.manualFinanceExpense.update({
                where: { id: expense.id },
                data: {
                    reconciled: true,
                    matchedStatementLineId: line.id,
                },
            }),
        ]);
    } else {
        const order = await prisma.order.findUnique({
            where: { id: parsed.id },
            select: { id: true, veraWorkflowFlags: true },
        });
        if (!order) throw new Error('Ordine non trovato.');
        const flags = {
            ...((order.veraWorkflowFlags as Record<string, unknown>) || {}),
            floristLinkedExpenseId: expense.id,
        };
        await prisma.$transaction([
            prisma.order.update({
                where: { id: order.id },
                data: {
                    veraWorkflowFlags: flags as Prisma.InputJsonValue,
                    floristSettlementStatus: 'RICEVUTA',
                },
            }),
            prisma.manualFinanceExpense.update({
                where: { id: expense.id },
                data: { reconciled: true },
            }),
        ]);
    }

    return { expenseId: expense.id };
}

export async function updateFloristMissingRow(input: {
    rowId: string;
    paymentDate?: string;
    amountCents?: number;
    partnerId?: string | null;
    notes?: string | null;
    orderId?: string | null;
}): Promise<void> {
    const parsed = parseRowId(input.rowId);
    if (!parsed) throw new Error('rowId non valido.');

    if (parsed.kind === 'bank') {
        const line = await prisma.bankStatementLine.findUnique({ where: { id: parsed.id } });
        if (!line) throw new Error('Movimento bancario non trovato.');

        const patch: Partial<FloristAlertMeta> = {};
        if (input.paymentDate) patch.overridePaymentDate = input.paymentDate.slice(0, 10);
        if (typeof input.amountCents === 'number' && input.amountCents > 0) {
            patch.overrideAmountCents = Math.round(input.amountCents);
        }
        if (input.notes !== undefined) patch.notes = input.notes || '';

        const data: {
            rawJson: Record<string, unknown>;
            matchedOrderId?: string | null;
            matchNotes?: string;
            matchStatus?: string;
            matchType?: string;
            matchScore?: number | null;
        } = {
            rawJson: mergeFloristAlertMeta(line.rawJson, patch),
        };

        if (input.orderId !== undefined) {
            if (input.orderId) {
                const order = await prisma.order.findUnique({
                    where: { id: input.orderId },
                    select: { id: true, orderNumber: true, createdAt: true },
                });
                if (!order) throw new Error('Ordine non trovato.');
                const payDate = line.accountingDate || line.valueDate;
                if (payDate && order.createdAt.getTime() - payDate.getTime() > 2 * 24 * 60 * 60 * 1000) {
                    throw new Error(
                        `Incongruenza date: ordine ${order.orderNumber || order.id} creato dopo il bonifico.`
                    );
                }
                data.matchedOrderId = order.id;
                data.matchStatus = 'MATCHED';
                data.matchType = line.matchType?.startsWith('FLORIST')
                    ? line.matchType
                    : 'FLORIST_TRANSFER';
                data.matchScore = 100;
                data.matchNotes = `Ordine associato da Contabilità: ${order.orderNumber || order.id}`;
            } else {
                data.matchedOrderId = null;
                data.matchStatus = 'UNMATCHED';
                data.matchScore = null;
                data.matchNotes = 'Associazione ordine rimossa da Contabilità';
            }
        }

        await prisma.bankStatementLine.update({
            where: { id: line.id },
            data: {
                ...data,
                rawJson: data.rawJson as Prisma.InputJsonValue,
            },
        });

        if (input.partnerId && data.matchedOrderId) {
            await prisma.order.update({
                where: { id: data.matchedOrderId },
                data: { partnerId: input.partnerId },
            });
        } else if (input.partnerId && line.matchedOrderId) {
            await prisma.order.update({
                where: { id: line.matchedOrderId },
                data: { partnerId: input.partnerId },
            });
        }
        return;
    }

    // order-*
    const order = await prisma.order.findUnique({
        where: { id: parsed.id },
        select: { id: true, veraWorkflowFlags: true },
    });
    if (!order) throw new Error('Ordine non trovato.');

    const data: {
        floristCompensationCents?: number;
        partnerId?: string | null;
        financeNotes?: string | null;
        deliveryDate?: Date;
    } = {};
    if (typeof input.amountCents === 'number' && input.amountCents > 0) {
        data.floristCompensationCents = Math.round(input.amountCents);
    }
    if (input.partnerId !== undefined) data.partnerId = input.partnerId;
    if (input.notes !== undefined) data.financeNotes = input.notes;
    if (input.paymentDate) {
        data.deliveryDate = new Date(`${input.paymentDate.slice(0, 10)}T12:00:00.000Z`);
    }

    await prisma.order.update({ where: { id: order.id }, data });
}

export async function dismissFloristMissingRow(rowId: string): Promise<void> {
    const parsed = parseRowId(rowId);
    if (!parsed) throw new Error('rowId non valido.');

    if (parsed.kind === 'bank') {
        const line = await prisma.bankStatementLine.findUnique({ where: { id: parsed.id } });
        if (!line) throw new Error('Movimento bancario non trovato.');
        const rawJson = mergeFloristAlertMeta(line.rawJson, {
            dismissedAt: new Date().toISOString(),
        });
        await prisma.bankStatementLine.update({
            where: { id: line.id },
            data: {
                rawJson: rawJson as Prisma.InputJsonValue,
                matchNotes: `${line.matchNotes || ''} | Archiviato da alert fioristi ${new Date().toISOString().slice(0, 10)}`.trim(),
            },
        });
        return;
    }

    const order = await prisma.order.findUnique({
        where: { id: parsed.id },
        select: { id: true, veraWorkflowFlags: true },
    });
    if (!order) throw new Error('Ordine non trovato.');
    const flags = {
        ...((order.veraWorkflowFlags as Record<string, unknown>) || {}),
        floristMissingDismissedAt: new Date().toISOString(),
    };
    await prisma.order.update({
        where: { id: order.id },
        data: { veraWorkflowFlags: flags as Prisma.InputJsonValue },
    });
}

/**
 * Allega scontrino/ricevuta fiscale al pagamento fiorista.
 * Persistenza: ManualFinanceExpense (docType SCONTRINO) + link bank line / orderId in metadata.
 * Non tocca mai foto consegna, GdM, bacheche utente/ordine/defunto.
 */
export async function uploadFloristMissingReceipt(input: {
    rowId: string;
    buffer: Buffer;
    fileName: string;
    contentType: string;
}): Promise<{
    receiptUrl: string | null;
    receiptPath: string | null;
    expenseId: string;
    fiscalOnly: true;
}> {
    const parsed = parseRowId(input.rowId);
    if (!parsed) throw new Error('rowId non valido.');

    let partnerName = 'Fiorista';
    let amountCents = 0;
    let expenseDate = new Date().toISOString().slice(0, 10);
    let orderId: string | null = null;
    let orderNumber: string | null = null;
    let bankLineId: string | null = null;

    if (parsed.kind === 'bank') {
        const line = await prisma.bankStatementLine.findUnique({ where: { id: parsed.id } });
        if (!line) throw new Error('Movimento bancario non trovato.');
        bankLineId = line.id;
        amountCents = Math.abs(line.amountCents);
        const pay = line.accountingDate || line.valueDate;
        if (pay) expenseDate = pay.toISOString().slice(0, 10);
        orderId = line.matchedOrderId;
        if (orderId) {
            const order = await prisma.order.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    orderNumber: true,
                    floristCompensationCents: true,
                    partner: { select: { shopName: true } },
                },
            });
            if (order) {
                orderNumber = order.orderNumber;
                partnerName = order.partner?.shopName || partnerName;
                if (order.floristCompensationCents && order.floristCompensationCents > 0) {
                    amountCents = order.floristCompensationCents;
                }
            }
        }
        if (amountCents <= 0) amountCents = Math.abs(line.amountCents) || 1;
    } else {
        const order = await prisma.order.findUnique({
            where: { id: parsed.id },
            select: {
                id: true,
                orderNumber: true,
                floristCompensationCents: true,
                createdAt: true,
                deliveryDate: true,
                partner: { select: { shopName: true } },
            },
        });
        if (!order) throw new Error('Ordine non trovato.');
        orderId = order.id;
        orderNumber = order.orderNumber;
        partnerName = order.partner?.shopName || partnerName;
        amountCents = order.floristCompensationCents || 1;
        const ref = order.deliveryDate && order.deliveryDate.getTime() <= Date.now()
            ? order.deliveryDate
            : order.createdAt;
        expenseDate = ref.toISOString().slice(0, 10);
    }

    const expense = await createManualExpense({
        expenseDate,
        docType: 'SCONTRINO',
        vendorName: partnerName,
        description: `Scontrino/ricevuta fiscale compenso fiorista${
            orderNumber ? ` — ordine ${orderNumber}` : ''
        } (solo Contabilità)`,
        totalCents: amountCents,
        vatRate: 0,
        file: {
            buffer: input.buffer,
            fileName: input.fileName,
            contentType: input.contentType,
        },
        notes:
            'FISCAL_ONLY — non propagare a GdM, bacheche, Order.photos, DeliveryProof, DeceasedProfile',
        metadataJson: {
            fiscalOnly: true,
            neverPropagateToGdm: true,
            neverPropagateToBacheca: true,
            source: 'florist_missing_receipt_upload',
            orderId,
            orderNumber,
            bankLineId,
            rowId: input.rowId,
        },
        matchedStatementLineId: bankLineId,
        reconciled: Boolean(bankLineId),
    });

    if (parsed.kind === 'bank' && bankLineId) {
        const line = await prisma.bankStatementLine.findUnique({ where: { id: bankLineId } });
        if (line) {
            const rawJson = mergeFloristAlertMeta(line.rawJson, {
                linkedExpenseId: expense.id,
                // URL solo in Contabilità (expense); riferimento leggero sulla riga bank
                receiptUrl: expense.blobUrl || undefined,
                receiptPath: expense.blobPath || undefined,
            });
            await prisma.bankStatementLine.update({
                where: { id: line.id },
                data: {
                    rawJson: rawJson as Prisma.InputJsonValue,
                    matchNotes: `${line.matchNotes || ''} | Scontrino fiscale ${expense.id}`.trim(),
                },
            });
        }
    } else if (orderId) {
        // Solo ID spesa in flags ordine — MAI URL foto (evita leak verso UI ordine/GdM).
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { veraWorkflowFlags: true },
        });
        const prev = (order?.veraWorkflowFlags as Record<string, unknown>) || {};
        const next = { ...prev };
        delete next.floristReceiptUrl;
        delete next.floristReceiptPath;
        next.floristLinkedExpenseId = expense.id;
        next.floristFiscalReceiptAt = new Date().toISOString();
        await prisma.order.update({
            where: { id: orderId },
            data: { veraWorkflowFlags: next as Prisma.InputJsonValue },
        });
    }

    return {
        receiptUrl: expense.blobUrl,
        receiptPath: expense.blobPath,
        expenseId: expense.id,
        fiscalOnly: true,
    };
}

export { parseRowId, readFloristAlertMeta };
