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
import {
    scorporaIvaFloreale,
    scorporaIvaOrdinaria,
    VAT_PCT_FLORAL,
    VAT_PCT_ORDINARY,
} from '@/lib/financial/vat';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

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

/** Inserisce solo chiavi assenti — mai overwrite (immutabilità sync massivo). */
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
 * Upsert su sourceKey (ON CONFLICT DO UPDATE).
 * Perché: aggiornamenti Prima Nota devono aggiornare la riga esistente, non crearne versioni :v&lt;Date.now()&gt;.
 */
export async function upsertLedgerEntry(
    input: LedgerEntryInput
): Promise<'inserted' | 'updated'> {
    const row = toRow(input);
    const existing = await prisma.financialLedgerEntry.findUnique({
        where: { sourceKey: row.sourceKey as string },
        select: { id: true },
    });

    if (!existing) {
        await prisma.financialLedgerEntry.create({ data: row });
        return 'inserted';
    }

    await prisma.financialLedgerEntry.update({
        where: { sourceKey: row.sourceKey as string },
        data: {
            direction: row.direction,
            category: row.category,
            fiscalYear: row.fiscalYear,
            fiscalQuarter: row.fiscalQuarter,
            periodKey: row.periodKey,
            accountingDate: row.accountingDate,
            valueDate: row.valueDate,
            description: row.description,
            counterpartyName: row.counterpartyName,
            counterpartyVat: row.counterpartyVat,
            netCents: row.netCents,
            vatRate: row.vatRate,
            vatCents: row.vatCents,
            totalCents: row.totalCents,
            reconciliationStatus: row.reconciliationStatus,
            documentRef: row.documentRef,
            attachmentUrl: row.attachmentUrl,
            attachmentPath: row.attachmentPath,
            attachmentKind: row.attachmentKind,
            bankLineId: row.bankLineId,
            orderId: row.orderId,
            partnerId: row.partnerId,
            metadataJson: row.metadataJson,
            reversedAt: null,
        },
    });
    return 'updated';
}

/**
 * Dual-write da scrittura Prima Nota JSON → PG permanente (upsert su sourceKey stabile).
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
    await upsertLedgerEntry({
        sourceKey: `JSON_ENTRY:${entry.id}`,
        sourceType: 'JSON_ENTRY',
        sourceId: entry.id,
        direction,
        category,
        accountingDate: new Date(`${entry.date}T12:00:00.000Z`),
        description: entry.description,
        netCents: direction === 'ENTRATA' ? net : -net,
        vatCents:
            direction === 'ENTRATA'
                ? Math.abs(entry.vatAmountCents || 0)
                : -Math.abs(entry.vatAmountCents || 0),
        totalCents: signed,
        documentRef: entry.invoiceReference,
        reconciliationStatus: 'N/A',
        metadataJson: {
            dareAccount: entry.dareAccount,
            avereAccount: entry.avereAccount,
        },
    });
}

/**
 * Sincronizza fonti Neon → registro storico (idempotente).
 */
export async function syncHistoricalLedgerFromSources(): Promise<{
    inserted: number;
    skipped: number;
    sources: Record<string, number>;
    paypalSanitize?: Awaited<
        ReturnType<typeof import('@/lib/financial/ledgerDoubleEntrySanitize').sanitizeLedgerDoubleEntryAnomalies>
    >;
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
            isRecurring: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            additionalInstructions: true,
            financeNotes: true,
        },
        take: 5000,
        orderBy: { createdAt: 'desc' },
    });

    for (const o of orders) {
        if (!o.totalPriceCents || o.totalPriceCents <= 0) continue;
        const d = o.createdAt;
        const isPose = isPrepaidSubscriptionPoseOrder(o);

        // Ricavo vendita: solo su pagamento reale — non sulle pose di abbonamento prepagato.
        if (!isPose) {
            const vat = scorporaIvaFloreale(o.totalPriceCents);
            candidates.push({
                sourceKey: `ORDER:${o.id}`,
                sourceType: 'ORDER',
                sourceId: o.id,
                direction: 'ENTRATA',
                category: 'RICAVI_VENDITE',
                accountingDate: d,
                description: `Ricavo ordine ${o.orderNumber || o.id.slice(0, 8)} (${o.paymentMethodLabel || 'checkout'})`,
                netCents: vat.imponibileCents,
                vatRate: VAT_PCT_FLORAL,
                vatCents: vat.ivaCents,
                totalCents: o.totalPriceCents,
                reconciliationStatus: o.stripeTransactionId ? 'MATCHED' : 'PARTIAL',
                documentRef: o.orderNumber || o.id,
                orderId: o.id,
                partnerId: o.partnerId,
                metadataJson: { stripeTransactionId: o.stripeTransactionId },
            });
            sources.ORDER = (sources.ORDER || 0) + 1;
        }

        // Compenso fiorista — anche sulle pose prepagate (costo vivo evasione).
        const paid =
            o.partnerPaymentStatus === 'PAID' ||
            o.floristSettlementStatus === 'BONIFICATO' ||
            o.floristSettlementStatus === 'RICEVUTA';
        const comp = o.floristCompensationCents || 0;
        if (paid && comp > 0) {
            const floristVat = scorporaIvaFloreale(comp);
            candidates.push({
                sourceKey: `FLORIST_PAYOUT:${o.id}`,
                sourceType: 'FLORIST_PAYOUT',
                sourceId: o.id,
                direction: 'USCITA',
                category: 'COSTI_FIORISTI',
                accountingDate: o.updatedAt || d,
                description: `Compenso fiorista ordine ${o.orderNumber || o.id.slice(0, 8)}`,
                netCents: -floristVat.imponibileCents,
                vatRate: VAT_PCT_FLORAL,
                vatCents: -floristVat.ivaCents,
                totalCents: -comp,
                reconciliationStatus:
                    o.floristSettlementStatus === 'RICEVUTA' ? 'MATCHED' : 'PARTIAL',
                documentRef: o.orderNumber || o.id,
                orderId: o.id,
                partnerId: o.partnerId,
                metadataJson: {
                    floristSettlementStatus: o.floristSettlementStatus,
                    partnerPaymentStatus: o.partnerPaymentStatus,
                    prepaidSubscriptionPose: isPose || undefined,
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
            orderId: (typeof meta.orderId === 'string' ? meta.orderId : null) || null,
            partnerId: (typeof meta.partnerId === 'string' ? meta.partnerId : null) || null,
            metadataJson: {
                docType: e.docType,
                source: meta.source,
                periodKey: e.periodKey,
                orderNumber: meta.orderNumber || null,
            },
        });
        sources.MANUAL_EXPENSE = (sources.MANUAL_EXPENSE || 0) + 1;
    }

    // 3) SaaS estere — reverse charge 22% (neutro: IVA debito = IVA credito, vatCents=0 sul netto)
    const saas = await prisma.saasForeignInvoice.findMany({
        orderBy: { invoiceDate: 'desc' },
        take: 2000,
    });
    for (const s of saas) {
        const gross = Math.abs(s.eurAmountCents);
        const rc = scorporaIvaOrdinaria(gross);
        candidates.push({
            sourceKey: `SAAS_INVOICE:${s.id}`,
            sourceType: 'SAAS_INVOICE',
            sourceId: s.id,
            direction: 'USCITA',
            category: 'SPESE_SAAS',
            accountingDate: s.invoiceDate,
            description: `SaaS ${s.vendorName} (${s.jurisdiction}/${s.autofatturaType})`,
            counterpartyName: s.vendorName,
            netCents: -rc.imponibileCents,
            vatRate: VAT_PCT_ORDINARY,
            // Reverse charge: IVA a debito e a credito si annullano — non alterare ivaCredito netto
            vatCents: 0,
            totalCents: -gross,
            reconciliationStatus: 'N/A',
            documentRef: s.fileName,
            attachmentUrl: s.blobUrl,
            attachmentPath: s.blobPath,
            attachmentKind: 'PDF',
            metadataJson: {
                periodKey: s.periodKey,
                countryCode: s.countryCode,
                reverseCharge: true,
                reverseChargeVatCents: rc.ivaCents,
                reverseChargeImponibileCents: rc.imponibileCents,
            },
        });
        sources.SAAS_INVOICE = (sources.SAAS_INVOICE || 0) + 1;
    }

    // 4) Movimenti Fineco
    const { LEDGER_FINECO_ACCOUNT } = await import('@/lib/financial/companyBankDetails');
    const bankLines = await prisma.bankStatementLine.findMany({
        orderBy: { accountingDate: 'desc' },
        take: 8000,
    });
    for (const line of bankLines) {
        const d = line.accountingDate || line.valueDate || line.createdAt;
        const isIn = line.amountCents > 0;
        const category = categorizeBankLine(line.description, line.matchType);
        // Override entrata generica: se non gateway, ALTRI_RICAVI; gateway già TRASFERIMENTO_INTERNO
        const resolved =
            isIn && category === 'SPESE_OPERATIVE'
                ? 'ALTRI_RICAVI'
                : category;
        const isTransfer =
            resolved === 'TRASFERIMENTO_INTERNO' || resolved === 'PAYPAL_PAYOUT';
        candidates.push({
            sourceKey: `BANK_LINE:${line.id}`,
            sourceType: 'BANK_LINE',
            sourceId: line.id,
            direction: isIn ? 'ENTRATA' : 'USCITA',
            category: resolved,
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
                dareAccount: isIn
                    ? LEDGER_FINECO_ACCOUNT
                    : resolved === 'ONERI_BANCARI'
                      ? '70200 - Oneri bancari / Fee gateway'
                      : '70900 - Spese operative',
                avereAccount: isIn
                    ? isTransfer
                        ? '17100 - Conto transitorio Gateway (giroconto)'
                        : '60100 - Ricavi da Vendite'
                    : LEDGER_FINECO_ACCOUNT,
            },
        });
        sources.BANK_LINE = (sources.BANK_LINE || 0) + 1;
    }

    // 5) Stripe fees → conto 10300 (non Fineco)
    const { LEDGER_STRIPE_ACCOUNT } = await import('@/lib/financial/companyBankDetails');
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
            metadataJson: {
                type: m.type,
                amountCents: m.amountCents,
                dareAccount: '70200 - Oneri bancari / Fee Stripe',
                avereAccount: LEDGER_STRIPE_ACCOUNT,
            },
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
    const { sanitizeLedgerDoubleEntryAnomalies } = await import(
        '@/lib/financial/ledgerDoubleEntrySanitize'
    );
    const paypalSanitize = await sanitizeLedgerDoubleEntryAnomalies();
    return { ...result, sources, paypalSanitize };
}
