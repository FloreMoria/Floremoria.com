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
import {
    isFloristDocStatus,
    type FloristDocStatus,
} from '@/lib/financial/floristDocStatus';

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
        if (line.matchedOrderId) {
            const order = await prisma.order.findUnique({
                where: { id: line.matchedOrderId },
                select: { veraWorkflowFlags: true },
            });
            const docType = (await prisma.manualFinanceExpense.findUnique({
                where: { id: expense.id },
                select: { docType: true },
            }))?.docType;
            const status =
                docType === 'SCONTRINO' || docType === 'RICEVUTA'
                    ? 'RECEIPT_ASSOCIATED'
                    : 'INVOICE_ASSOCIATED';
            const flags = {
                ...((order?.veraWorkflowFlags as Record<string, unknown>) || {}),
                floristLinkedExpenseId: expense.id,
                floristDocStatus: status,
            };
            await prisma.order.update({
                where: { id: line.matchedOrderId },
                data: {
                    veraWorkflowFlags: flags as Prisma.InputJsonValue,
                    floristSettlementStatus: 'RICEVUTA',
                },
            });
        }
    } else {
        const order = await prisma.order.findUnique({
            where: { id: parsed.id },
            select: { id: true, veraWorkflowFlags: true },
        });
        if (!order) throw new Error('Ordine non trovato.');
        const exp = await prisma.manualFinanceExpense.findUnique({
            where: { id: expense.id },
            select: { docType: true },
        });
        const status =
            exp?.docType === 'SCONTRINO' || exp?.docType === 'RICEVUTA'
                ? 'RECEIPT_ASSOCIATED'
                : 'INVOICE_ASSOCIATED';
        const flags = {
            ...((order.veraWorkflowFlags as Record<string, unknown>) || {}),
            floristLinkedExpenseId: expense.id,
            floristDocStatus: status,
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

    const updated = await prisma.order.update({
        where: { id: order.id },
        data,
        select: {
            id: true,
            orderNumber: true,
            partnerId: true,
            floristCompensationCents: true,
            floristSettlementStatus: true,
            deliveryDate: true,
            createdAt: true,
            updatedAt: true,
            veraWorkflowFlags: true,
        },
    });

    // Propaga importo aggiornato sulla scrittura Prima Nota (FLORIST_PAYOUT)
    const comp = updated.floristCompensationCents || 0;
    if (comp > 0) {
        try {
            const { scorporaIvaFloreale, VAT_PCT_FLORAL } = await import('@/lib/financial/vat');
            const { upsertLedgerEntry } = await import('@/lib/financial/historicalLedgerSync');
            const floristVat = scorporaIvaFloreale(comp);
            const d = updated.deliveryDate || updated.createdAt || updated.updatedAt;
            const flags = (updated.veraWorkflowFlags as Record<string, unknown>) || {};
            const linkedExpenseId =
                typeof flags.floristLinkedExpenseId === 'string'
                    ? flags.floristLinkedExpenseId
                    : null;
            await upsertLedgerEntry({
                sourceKey: `FLORIST_PAYOUT:${updated.id}`,
                sourceType: 'FLORIST_PAYOUT',
                sourceId: updated.id,
                direction: 'USCITA',
                category: 'COSTI_FIORISTI',
                accountingDate: d,
                description: `Compenso fiorista ordine ${updated.orderNumber || updated.id.slice(0, 8)}`,
                netCents: -floristVat.imponibileCents,
                vatRate: VAT_PCT_FLORAL,
                vatCents: -floristVat.ivaCents,
                totalCents: -comp,
                reconciliationStatus:
                    updated.floristSettlementStatus === 'RICEVUTA' ? 'MATCHED' : 'PARTIAL',
                documentRef: updated.orderNumber || updated.id,
                orderId: updated.id,
                partnerId: updated.partnerId,
                metadataJson: {
                    floristSettlementStatus: updated.floristSettlementStatus,
                    linkedExpenseId,
                },
            });

            // Se c'è già scontrino collegato, aggiorna anche MANUAL_EXPENSE + ledger
            if (linkedExpenseId) {
                const exp = await prisma.manualFinanceExpense.findUnique({
                    where: { id: linkedExpenseId },
                });
                if (exp) {
                    const vatRate = exp.vatRate || VAT_PCT_FLORAL;
                    const vatCents =
                        vatRate > 0
                            ? Math.round(comp - comp / (1 + vatRate / 100))
                            : 0;
                    const netCents = comp - vatCents;
                    await prisma.manualFinanceExpense.update({
                        where: { id: exp.id },
                        data: {
                            totalCents: comp,
                            vatCents,
                            netCents,
                            expenseDate: input.paymentDate
                                ? new Date(`${input.paymentDate.slice(0, 10)}T12:00:00.000Z`)
                                : exp.expenseDate,
                        },
                    });
                    const { manualExpenseAttachmentUrl } = await import(
                        '@/lib/financial/manualExpenses'
                    );
                    await upsertLedgerEntry({
                        sourceKey: `MANUAL_EXPENSE:${exp.id}`,
                        sourceType: 'MANUAL_EXPENSE',
                        sourceId: exp.id,
                        direction: 'USCITA',
                        category: 'COSTI_FIORISTI',
                        accountingDate: input.paymentDate
                            ? new Date(`${input.paymentDate.slice(0, 10)}T12:00:00.000Z`)
                            : exp.expenseDate,
                        description: exp.description,
                        counterpartyName: exp.vendorName,
                        netCents: -netCents,
                        vatRate,
                        vatCents: -vatCents,
                        totalCents: -comp,
                        reconciliationStatus: exp.reconciled ? 'MATCHED' : 'UNMATCHED',
                        documentRef: updated.orderNumber || exp.fileName || exp.id,
                        attachmentUrl: manualExpenseAttachmentUrl(exp),
                        attachmentPath: exp.blobPath,
                        bankLineId: exp.matchedStatementLineId,
                        orderId: updated.id,
                        partnerId: updated.partnerId,
                        metadataJson: {
                            docType: exp.docType,
                            source: 'florist_missing_receipt_upload',
                        },
                    });
                }
            }
        } catch (err) {
            console.error('[updateFloristMissingRow] sync Prima Nota', err);
        }
    }
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
    let partnerId: string | null = null;
    let partnerVat: string | null = null;
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
                    partnerId: true,
                    partner: {
                        select: { id: true, shopName: true, vatNumber: true, taxCode: true },
                    },
                },
            });
            if (order) {
                orderNumber = order.orderNumber;
                partnerId = order.partnerId || order.partner?.id || null;
                partnerName = order.partner?.shopName || partnerName;
                partnerVat = order.partner?.vatNumber || order.partner?.taxCode || null;
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
                partnerId: true,
                partner: {
                    select: { id: true, shopName: true, vatNumber: true, taxCode: true },
                },
            },
        });
        if (!order) throw new Error('Ordine non trovato.');
        orderId = order.id;
        orderNumber = order.orderNumber;
        partnerId = order.partnerId || order.partner?.id || null;
        partnerName = order.partner?.shopName || partnerName;
        partnerVat = order.partner?.vatNumber || order.partner?.taxCode || null;
        amountCents = order.floristCompensationCents || 1;
        const ref =
            order.deliveryDate && order.deliveryDate.getTime() <= Date.now()
                ? order.deliveryDate
                : order.createdAt;
        expenseDate = ref.toISOString().slice(0, 10);
    }

    const { VAT_PCT_FLORAL } = await import('@/lib/financial/vat');

    const expense = await createManualExpense({
        expenseDate,
        docType: 'SCONTRINO',
        vendorName: partnerName,
        description: `Scontrino/ricevuta fiscale compenso fiorista${
            orderNumber ? ` — ordine ${orderNumber}` : ''
        } (solo Contabilità)`,
        totalCents: amountCents,
        vatRate: VAT_PCT_FLORAL,
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
            partnerId,
            vendorVat: partnerVat,
            bankLineId,
            rowId: input.rowId,
        },
        matchedStatementLineId: bankLineId,
        reconciled: Boolean(bankLineId),
    });

    const receiptUrl = expense.blobUrl;

    if (parsed.kind === 'bank' && bankLineId) {
        const line = await prisma.bankStatementLine.findUnique({ where: { id: bankLineId } });
        if (line) {
            const rawJson = mergeFloristAlertMeta(line.rawJson, {
                linkedExpenseId: expense.id,
                receiptUrl: receiptUrl || undefined,
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
    }

    // Sempre aggiorna ordine collegato (stato + expense id) — mai URL su Order.photos/GdM.
    if (orderId) {
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
        next.floristDocStatus = 'RECEIPT_ASSOCIATED';
        await prisma.order.update({
            where: { id: orderId },
            data: {
                veraWorkflowFlags: next as Prisma.InputJsonValue,
                floristSettlementStatus: 'RICEVUTA',
            },
        });
    }

    return {
        receiptUrl,
        receiptPath: expense.blobPath,
        expenseId: expense.id,
        fiscalOnly: true,
    };
}

/**
 * Imposta lo stato documento fiscale sul registro fioristi (persistente su Order).
 */
export async function setFloristDocStatus(input: {
    rowId: string;
    docStatus: FloristDocStatus;
}): Promise<{ orderId: string; docStatus: FloristDocStatus }> {
    if (!isFloristDocStatus(input.docStatus)) {
        throw new Error('Stato documento non valido.');
    }
    const parsed = parseRowId(input.rowId);
    if (!parsed) throw new Error('rowId non valido.');

    let orderId = parsed.kind === 'order' ? parsed.id : null;
    if (parsed.kind === 'bank') {
        const line = await prisma.bankStatementLine.findUnique({
            where: { id: parsed.id },
            select: { matchedOrderId: true },
        });
        orderId = line?.matchedOrderId || null;
        if (!orderId) {
            throw new Error('Collega prima un ordine al movimento, poi imposta lo stato.');
        }
    }
    if (!orderId) throw new Error('Ordine non trovato.');

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, veraWorkflowFlags: true },
    });
    if (!order) throw new Error('Ordine non trovato.');

    const flags: Record<string, unknown> = {
        ...((order.veraWorkflowFlags as Record<string, unknown>) || {}),
        floristDocStatus: input.docStatus,
        floristDocStatusAt: new Date().toISOString(),
    };
    if (input.docStatus === 'NOT_DUE' || input.docStatus === 'CANCELLED') {
        flags.floristMissingDismissedAt = new Date().toISOString();
    } else {
        delete flags.floristMissingDismissedAt;
    }

    const settlementPatch =
        input.docStatus === 'INVOICE_ASSOCIATED' || input.docStatus === 'RECEIPT_ASSOCIATED'
            ? { floristSettlementStatus: 'RICEVUTA' as const }
            : input.docStatus === 'WAITING_INVOICE'
              ? { floristSettlementStatus: 'PENDING' as const }
              : {};

    await prisma.order.update({
        where: { id: order.id },
        data: {
            veraWorkflowFlags: flags as Prisma.InputJsonValue,
            ...settlementPatch,
        },
    });

    return { orderId: order.id, docStatus: input.docStatus };
}

export { parseRowId, readFloristAlertMeta };
