/**
 * Motore sync → Registro Storico Permanente (append-only su Neon).
 * Perché: JSON ledger su /tmp è effimero; bilanci e IVA richiedono cronistoria immutabile.
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
    categorizeBankLine,
    categorizeManualExpense,
    fiscalParts,
    type LedgerEntryInput,
} from '@/lib/financial/historicalLedgerTypes';

function toRow(input: LedgerEntryInput): Prisma.FinancialLedgerEntryCreateManyInput {
    const parts = fiscalParts(input.accountingDate);
    return {
        sourceKey: input.sourceKey.slice(0, 180),
        sourceType: input.sourceType,
        sourceId: input.sourceId.slice(0, 128),
        direction: input.direction,
        category: input.category,
        fiscalYear: parts.fiscalYear,
        fiscalQuarter: parts.fiscalQuarter,
        periodKey: parts.periodKey,
        accountingDate: input.accountingDate,
        valueDate: input.valueDate || null,
        description: input.description.slice(0, 4000),
        counterpartyName: input.counterpartyName?.slice(0, 160) || null,
        counterpartyVat: input.counterpartyVat?.slice(0, 32) || null,
        netCents: input.netCents,
        vatRate: input.vatRate ?? 0,
        vatCents: input.vatCents ?? 0,
        totalCents: input.totalCents,
        currency: 'EUR',
        reconciliationStatus: input.reconciliationStatus || 'UNMATCHED',
        documentRef: input.documentRef?.slice(0, 160) || null,
        attachmentUrl: input.attachmentUrl || null,
        attachmentPath: input.attachmentPath || null,
        attachmentKind: input.attachmentKind || null,
        bankLineId: input.bankLineId || null,
        orderId: input.orderId || null,
        partnerId: input.partnerId || null,
        metadataJson: (input.metadataJson || undefined) as Prisma.InputJsonValue | undefined,
        reversesEntryId: input.reversesEntryId || null,
    };
}

/** Inserisce solo chiavi assenti — mai overwrite (immutabilità). */
export async function appendLedgerEntries(
    entries: LedgerEntryInput[]
): Promise<{ inserted: number; skipped: number }> {
    if (!entries.length) return { inserted: 0, skipped: 0 };
    const rows = entries.map(toRow);
    const result = await prisma.financialLedgerEntry.createMany({
        data: rows,
        skipDuplicates: true,
    });
    return { inserted: result.count, skipped: Math.max(0, entries.length - result.count) };
}

/**
 * Dual-write da scrittura Prima Nota JSON → PG permanente.
 */
export async function persistJsonAccountingEntry(entry: {
    id: string;
    date: string;
    description: string;
    dareAccount: string;
    avereAccount: string;
    amountCents: number;
    vatAmountCents: number;
    invoiceReference: string | null;
}): Promise<void> {
    const { isFinanceSeedEntryId } = await import('@/lib/financial/formatFinanceDate');
    if (isFinanceSeedEntryId(entry.id)) return;

    const isRevenue = /Ricavi/i.test(entry.avereAccount || '');
    const isFlorist = /Produzione|Fiorist/i.test(entry.dareAccount || '');
    const isSaas = /SaaS|Software/i.test(entry.dareAccount || '');
    const isBank = /Commission|Banc/i.test(entry.dareAccount || '');
    let category: LedgerEntryInput['category'] = 'SPESE_OPERATIVE';
    let direction: LedgerEntryInput['direction'] = 'USCITA';
    if (isRevenue) {
        category = 'RICAVI_VENDITE';
        direction = 'ENTRATA';
    } else if (isFlorist) category = 'COSTI_FIORISTI';
    else if (isSaas) category = 'SPESE_SAAS';
    else if (isBank) category = 'ONERI_BANCARI';

    const signed = direction === 'ENTRATA' ? Math.abs(entry.amountCents) : -Math.abs(entry.amountCents);
    const net = Math.abs(entry.amountCents) - Math.abs(entry.vatAmountCents || 0);
    await appendLedgerEntries([
        {
            sourceKey: `JSON_ENTRY:${entry.id}`,
            sourceType: 'JSON_ENTRY',
            sourceId: entry.id,
            direction,
            category,
            accountingDate: new Date(`${entry.date}T12:00:00.000Z`),
            description: entry.description,
            netCents: direction === 'ENTRATA' ? net : -net,
            vatCents: direction === 'ENTRATA' ? Math.abs(entry.vatAmountCents || 0) : -Math.abs(entry.vatAmountCents || 0),
            totalCents: signed,
            documentRef: entry.invoiceReference,
            reconciliationStatus: 'N/A',
            metadataJson: {
                dareAccount: entry.dareAccount,
                avereAccount: entry.avereAccount,
            },
        },
    ]);
}

/**
 * Sincronizza fonti Neon → registro storico (idempotente).
 */
export async function syncHistoricalLedgerFromSources(): Promise<{
    inserted: number;
    skipped: number;
    sources: Record<string, number>;
    paypalSanitize?: {
        scanned: number;
        reversed: number;
        renamed: number;
        kept: number;
        groupsCollapsed: number;
    };
}> {
    const candidates: LedgerEntryInput[] = [];
    const sources: Record<string, number> = {};

    // 1) Ordini pagati → ricavi
    const orders = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            OR: [
                { status: { in: ['COMPLETED', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERING'] } },
                { stripeTransactionId: { not: null } },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            createdAt: true,
            updatedAt: true,
            paymentMethodLabel: true,
            stripeTransactionId: true,
            partnerId: true,
            floristCompensationCents: true,
            floristSettlementStatus: true,
            partnerPaymentStatus: true,
        },
        take: 5000,
        orderBy: { createdAt: 'desc' },
    });

    for (const o of orders) {
        if (!o.totalPriceCents || o.totalPriceCents <= 0) continue;
        const d = o.createdAt;
        const vatRate = 22;
        const total = o.totalPriceCents;
        const net = Math.round(total / (1 + vatRate / 100));
        const vat = total - net;
        candidates.push({
            sourceKey: `ORDER:${o.id}`,
            sourceType: 'ORDER',
            sourceId: o.id,
            direction: 'ENTRATA',
            category: 'RICAVI_VENDITE',
            accountingDate: d,
            description: `Ricavo ordine ${o.orderNumber || o.id.slice(0, 8)} (${o.paymentMethodLabel || 'checkout'})`,
            netCents: net,
            vatRate,
            vatCents: vat,
            totalCents: total,
            reconciliationStatus: o.stripeTransactionId ? 'MATCHED' : 'PARTIAL',
            documentRef: o.orderNumber || o.id,
            orderId: o.id,
            partnerId: o.partnerId,
            metadataJson: { stripeTransactionId: o.stripeTransactionId },
        });
        sources.ORDER = (sources.ORDER || 0) + 1;

        // Compenso fiorista liquidato
        const paid =
            o.partnerPaymentStatus === 'PAID' ||
            o.floristSettlementStatus === 'BONIFICATO' ||
            o.floristSettlementStatus === 'RICEVUTA';
        const comp = o.floristCompensationCents || 0;
        if (paid && comp > 0) {
            candidates.push({
                sourceKey: `FLORIST_PAYOUT:${o.id}`,
                sourceType: 'FLORIST_PAYOUT',
                sourceId: o.id,
                direction: 'USCITA',
                category: 'COSTI_FIORISTI',
                accountingDate: o.updatedAt || d,
                description: `Compenso fiorista ordine ${o.orderNumber || o.id.slice(0, 8)}`,
                netCents: -comp,
                vatRate: 0,
                vatCents: 0,
                totalCents: -comp,
                reconciliationStatus:
                    o.floristSettlementStatus === 'RICEVUTA' ? 'MATCHED' : 'PARTIAL',
                documentRef: o.orderNumber || o.id,
                orderId: o.id,
                partnerId: o.partnerId,
                metadataJson: {
                    floristSettlementStatus: o.floristSettlementStatus,
                    partnerPaymentStatus: o.partnerPaymentStatus,
                },
            });
            sources.FLORIST_PAYOUT = (sources.FLORIST_PAYOUT || 0) + 1;
        }
    }

    // 2) Fatture passive / spese manuali (SDI + manuali)
    const expenses = await prisma.manualFinanceExpense.findMany({
        orderBy: { expenseDate: 'desc' },
        take: 5000,
    });
    for (const e of expenses) {
        const meta = (e.metadataJson || {}) as Record<string, unknown>;
        if (meta.cancelledByCreditNote) continue;
        const isNc = e.docType === 'NOTA_CREDITO' || e.totalCents < 0;
        const category = isNc
            ? 'RIMBORSI'
            : categorizeManualExpense({
                  vendorName: e.vendorName,
                  description: e.description,
                  metadata: meta,
              });
        const absTotal = Math.abs(e.totalCents);
        const absNet = Math.abs(e.netCents || e.totalCents - e.vatCents);
        const absVat = Math.abs(e.vatCents);
        candidates.push({
            sourceKey: `MANUAL_EXPENSE:${e.id}`,
            sourceType: 'MANUAL_EXPENSE',
            sourceId: e.id,
            direction: isNc ? 'ENTRATA' : 'USCITA',
            category,
            accountingDate: e.expenseDate,
            description: e.description,
            counterpartyName: e.vendorName,
            counterpartyVat: (meta.vendorVat as string) || null,
            netCents: isNc ? absNet : -absNet,
            vatRate: e.vatRate,
            vatCents: isNc ? absVat : -absVat,
            totalCents: isNc ? absTotal : -absTotal,
            reconciliationStatus: e.reconciled ? 'MATCHED' : 'UNMATCHED',
            documentRef: (meta.invoiceNumber as string) || e.fileName || e.id,
            attachmentUrl: e.blobUrl,
            attachmentPath: e.blobPath,
            attachmentKind: e.contentType?.includes('xml')
                ? 'XML'
                : e.contentType?.includes('sheet')
                  ? 'XLSX'
                  : e.fileName?.match(/\.pdf$/i)
                    ? 'PDF'
                    : 'BLOB',
            bankLineId: e.matchedStatementLineId,
            metadataJson: { docType: e.docType, source: meta.source, periodKey: e.periodKey },
        });
        sources.MANUAL_EXPENSE = (sources.MANUAL_EXPENSE || 0) + 1;
    }

    // 3) SaaS estere
    const saas = await prisma.saasForeignInvoice.findMany({
        orderBy: { invoiceDate: 'desc' },
        take: 2000,
    });
    for (const s of saas) {
        candidates.push({
            sourceKey: `SAAS_INVOICE:${s.id}`,
            sourceType: 'SAAS_INVOICE',
            sourceId: s.id,
            direction: 'USCITA',
            category: 'SPESE_SAAS',
            accountingDate: s.invoiceDate,
            description: `SaaS ${s.vendorName} (${s.jurisdiction}/${s.autofatturaType})`,
            counterpartyName: s.vendorName,
            netCents: -Math.abs(s.eurAmountCents),
            vatRate: 0,
            vatCents: 0,
            totalCents: -Math.abs(s.eurAmountCents),
            reconciliationStatus: 'N/A',
            documentRef: s.fileName,
            attachmentUrl: s.blobUrl,
            attachmentPath: s.blobPath,
            attachmentKind: 'PDF',
            metadataJson: { periodKey: s.periodKey, countryCode: s.countryCode },
        });
        sources.SAAS_INVOICE = (sources.SAAS_INVOICE || 0) + 1;
    }

    // 4) Movimenti Fineco
    const bankLines = await prisma.bankStatementLine.findMany({
        orderBy: { accountingDate: 'desc' },
        take: 8000,
    });
    for (const line of bankLines) {
        const d = line.accountingDate || line.valueDate || line.createdAt;
        const isIn = line.amountCents > 0;
        const category = isIn
            ? (/STRIPE|PAYPAL|PAYOUT|INCASSO/i.test(line.description)
                  ? 'RICAVI_VENDITE'
                  : 'ALTRI_RICAVI')
            : categorizeBankLine(line.description, line.matchType);
        candidates.push({
            sourceKey: `BANK_LINE:${line.id}`,
            sourceType: 'BANK_LINE',
            sourceId: line.id,
            direction: isIn ? 'ENTRATA' : 'USCITA',
            category,
            accountingDate: d,
            valueDate: line.valueDate,
            description: line.description.slice(0, 2000),
            netCents: line.amountCents,
            vatRate: 0,
            vatCents: 0,
            totalCents: line.amountCents,
            reconciliationStatus: line.matchStatus || 'UNMATCHED',
            documentRef: line.matchedTxId || line.id,
            bankLineId: line.id,
            orderId: line.matchedOrderId,
            metadataJson: {
                matchType: line.matchType,
                documentId: line.documentId,
            },
        });
        sources.BANK_LINE = (sources.BANK_LINE || 0) + 1;
    }

    // 5) Stripe fees
    const stripeMoves = await prisma.stripeFinanceMovement.findMany({
        where: { feeCents: { gt: 0 } },
        orderBy: { createdAtStripe: 'desc' },
        take: 3000,
    });
    for (const m of stripeMoves) {
        candidates.push({
            sourceKey: `STRIPE_FEE:${m.stripeId}`,
            sourceType: 'STRIPE_MOVEMENT',
            sourceId: m.stripeId,
            direction: 'USCITA',
            category: 'ONERI_BANCARI',
            accountingDate: m.createdAtStripe,
            description: `Commissioni Stripe ${m.type} — ${m.description || m.stripeId}`,
            counterpartyName: 'Stripe',
            netCents: -Math.abs(m.feeCents),
            vatRate: 0,
            vatCents: 0,
            totalCents: -Math.abs(m.feeCents),
            reconciliationStatus: 'MATCHED',
            documentRef: m.payoutId || m.stripeId,
            orderId: m.orderId,
            metadataJson: { type: m.type, amountCents: m.amountCents },
        });
        sources.STRIPE_MOVEMENT = (sources.STRIPE_MOVEMENT || 0) + 1;
    }

    // 6) Ricevute cliente: aggiorna solo allegato sulle righe ORDER già presenti (no doppio ricavo)
    for (const r of await prisma.customerOrderReceipt.findMany({
        take: 3000,
        select: { orderId: true, blobUrl: true, blobPath: true, orderNumber: true },
    })) {
        try {
            await prisma.financialLedgerEntry.updateMany({
                where: {
                    sourceKey: `ORDER:${r.orderId}`,
                    attachmentUrl: null,
                },
                data: {
                    attachmentUrl: r.blobUrl,
                    attachmentPath: r.blobPath,
                    attachmentKind: 'PDF',
                    documentRef: r.orderNumber || undefined,
                },
            });
        } catch {
            /* tabella forse non ancora migrata in ambiente locale */
        }
        sources.CUSTOMER_RECEIPT = (sources.CUSTOMER_RECEIPT || 0) + 1;
    }

    const result = await appendLedgerEntries(candidates);
    const { sanitizePaypalLedgerDuplicates } = await import(
        '@/lib/financial/paypalLedgerSanitize'
    );
    const paypalSanitize = await sanitizePaypalLedgerDuplicates();
    return { ...result, sources, paypalSanitize };
}
