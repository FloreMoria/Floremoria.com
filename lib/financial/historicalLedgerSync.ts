/**
 * Motore sync → Registro Storico Permanente (append-only su Neon).
 * Fase 2: tutte le scritture passano da `commitLedgerEntries` (cancello unico).
 */

import prisma from '@/lib/prisma';
import {
    categorizeBankLine,
    categorizeManualExpense,
    type LedgerEntryInput,
} from '@/lib/financial/historicalLedgerTypes';
import {
    scorporaIvaFloreale,
    scorporaIvaOrdinaria,
    VAT_PCT_FLORAL,
    VAT_PCT_ORDINARY,
} from '@/lib/financial/vat';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import {
    commitLedgerEntries,
    commitLedgerEntry,
} from '@/lib/financial/ledgerWriteGate';
import { classifyFinecoBankCredit } from '@/lib/financial/payoutClassification';
import {
    LEDGER_COMMISSIONI_INCASSI,
    LEDGER_FINECO_ACCOUNT,
    LEDGER_STRIPE_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { isPayoutIdClassificationEnabled } from '@/lib/financial/chartOfAccounts';

/** Inserisce solo chiavi/eventi assenti — via cancello unico. */
export async function appendLedgerEntries(
    entries: LedgerEntryInput[]
): Promise<{ inserted: number; skipped: number }> {
    const result = await commitLedgerEntries(entries);
    return { inserted: result.inserted, skipped: result.skipped };
}

/**
 * Insert-or-skip su sourceKey/evento (Fase 2: mai update importi).
 * Return 'updated' rimosso semanticamente → 'skipped' se già presente.
 */
export async function upsertLedgerEntry(
    input: LedgerEntryInput
): Promise<'inserted' | 'updated' | 'skipped'> {
    const outcome = await commitLedgerEntry(input);
    // Compat call-site: 'updated' non avviene più; mappa skipped.
    return outcome === 'inserted' ? 'inserted' : 'skipped';
}

/**
 * Dual-write JSON → PG: riattivato via cancello unico (idempotente SKIP).
 * sourceKey = JSON_ENTRY:{id} — non sostituisce ORDER:/BANK_LINE: autoritativi.
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
    isForeignService?: boolean;
}): Promise<void> {
    const { commitAccountingEntriesToNeon } = await import(
        '@/lib/financial/commitAccountingToNeon'
    );
    await commitAccountingEntriesToNeon([
        {
            id: entry.id,
            date: entry.date,
            description: entry.description,
            dareAccount: entry.dareAccount,
            avereAccount: entry.avereAccount,
            amountCents: entry.amountCents,
            vatAmountCents: entry.vatAmountCents,
            isForeignService: Boolean(entry.isForeignService),
            invoiceReference: entry.invoiceReference,
            status: 'CONFIRMED',
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

    // 4) Movimenti Fineco — classificazione payout via payout id (flag)
    const bankLines = await prisma.bankStatementLine.findMany({
        orderBy: { accountingDate: 'desc' },
        take: 8000,
    });
    for (const line of bankLines) {
        const d = line.accountingDate || line.valueDate || line.createdAt;
        const isIn = line.amountCents > 0;

        let resolved = categorizeBankLine(line.description, line.matchType);
        let dareAccount: string;
        let avereAccount: string;
        let entryNature: LedgerEntryInput['entryNature'] = null;
        let settlementStatus: LedgerEntryInput['settlementStatus'] = null;
        let payoutId: string | undefined;
        let classificationNotes: string | undefined;

        if (isIn) {
            const cls = await classifyFinecoBankCredit({
                amountCents: line.amountCents,
                accountingDate: d,
                description: line.description,
                matchType: line.matchType,
            });
            resolved = cls.category;
            dareAccount = cls.dareAccount;
            avereAccount = cls.avereAccount;
            entryNature = cls.entryNature;
            settlementStatus = cls.settlementStatus;
            payoutId = cls.payoutId;
            classificationNotes = cls.notes;
        } else {
            if (resolved === 'SPESE_OPERATIVE') {
                /* keep */
            }
            dareAccount =
                resolved === 'ONERI_BANCARI'
                    ? LEDGER_COMMISSIONI_INCASSI
                    : '70900 - Spese operative';
            avereAccount = LEDGER_FINECO_ACCOUNT;
            entryNature = 'ECONOMICA';
            settlementStatus = 'NOT_APPLICABLE';
        }

        // Override entrata generica legacy solo se flag OFF e ancora SPESE_OPERATIVE
        if (
            isIn &&
            !isPayoutIdClassificationEnabled() &&
            resolved === 'SPESE_OPERATIVE'
        ) {
            resolved = 'ALTRI_RICAVI';
        }

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
            reconciliationStatus:
                settlementStatus === 'OPEN'
                    ? 'UNMATCHED'
                    : line.matchStatus || 'UNMATCHED',
            documentRef: payoutId || line.matchedTxId || line.id,
            bankLineId: line.id,
            orderId: line.matchedOrderId,
            entryNature,
            settlementStatus,
            matchedBankLineId: null,
            metadataJson: {
                matchType: line.matchType,
                documentId: line.documentId,
                dareAccount,
                avereAccount,
                payoutId: payoutId || null,
                classificationNotes: classificationNotes || null,
                payoutIdClassification: isPayoutIdClassificationEnabled(),
            },
        });
        sources.BANK_LINE = (sources.BANK_LINE || 0) + 1;
    }

    // 5) Stripe fees → Commissione su incassi / Banca c/o Stripe
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
            entryNature: 'ECONOMICA',
            settlementStatus: 'NOT_APPLICABLE',
            metadataJson: {
                type: m.type,
                amountCents: m.amountCents,
                stripeTransactionId: m.stripeId,
                dareAccount: LEDGER_COMMISSIONI_INCASSI,
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
