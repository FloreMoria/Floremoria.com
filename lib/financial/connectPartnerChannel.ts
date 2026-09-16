/**
 * Quarto canale: Stripe Connect – partner (account connesso FloreMoria in AF).
 *
 * Tre gambe per ordine + trasferimento Fineco atteso:
 * 1) corrispettivo = lordo cliente (mai il netto)
 * 2) fee partner = costo con IVA 22% (trattenuta = pagamento; fattura mensile non ridoppia)
 * 3) commissione Stripe = costo distinto
 * 4) bonifico → Fineco = TRASFERIMENTO_INTERNO atteso (non ricavo)
 */
import prisma from '@/lib/prisma';
import type { ConnectPartnerChargeSource, ConnectPartnerPayoutStatus } from '@prisma/client';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import type { LedgerEntryInput } from '@/lib/financial/historicalLedgerTypes';
import {
    LEDGER_COMMISSIONI_INCASSI,
    LEDGER_COMMISSIONI_PARTNER,
    LEDGER_CONNECT_PARTNER_ACCOUNT,
    LEDGER_FINECO_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { ACCOUNT_RICAVI_VENDITE } from '@/lib/financial/chartOfAccounts';
import { recomputePartnerFeeMonthClose } from '@/lib/partners/partnerFeeMonthClose';

export const CONNECT_CHANNEL_LABEL = 'Stripe Connect – partner' as const;
export const CONNECT_PAYMENT_METHOD_LABEL = 'Stripe Connect – partner' as const;

export type ConnectPartnerChargeInput = {
    orderNumber: string;
    orderId?: string | null;
    masterPartnerId: string;
    accountingDate: Date;
    grossCents: number;
    partnerFeeCents: number;
    partnerFeeTaxableCents: number;
    partnerFeeVatCents: number;
    stripeFeeCents: number;
    externalChargeId?: string | null;
    externalPayoutId?: string | null;
    notes?: string | null;
    source?: ConnectPartnerChargeSource;
};

function yearMonthFromDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function assertAmounts(input: ConnectPartnerChargeInput): number {
    if (input.grossCents <= 0) throw new Error('grossCents deve essere > 0 (corrispettivo lordo).');
    if (input.partnerFeeCents < 0 || input.stripeFeeCents < 0) {
        throw new Error('Fee non possono essere negative.');
    }
    if (input.partnerFeeTaxableCents + input.partnerFeeVatCents !== input.partnerFeeCents) {
        throw new Error('Imponibile + IVA fee partner devono sommare al lordo fee.');
    }
    const net = input.grossCents - input.partnerFeeCents - input.stripeFeeCents;
    if (net < 0) throw new Error('Netto Fineco negativo: controlla fee vs lordo.');
    return net;
}

/** Costruisce le 4 scritture ledger (idempotenti via sourceKey). */
export function buildConnectPartnerLedgerEntries(
    input: ConnectPartnerChargeInput & { netCents: number }
): LedgerEntryInput[] {
    const ref = input.orderNumber.trim();
    const date = input.accountingDate;
    const entries: LedgerEntryInput[] = [];

    // 1) Corrispettivo lordo → ricavo + entra nel transito Connect
    entries.push({
        sourceKey: `CONNECT_TX:${ref}`,
        sourceType: 'CONNECT_MOVEMENT',
        sourceId: ref.slice(0, 128),
        direction: 'ENTRATA',
        category: 'RICAVI_VENDITE',
        accountingDate: date,
        description: `Incasso Connect partner — corrispettivo ${ref}`,
        counterpartyName: CONNECT_CHANNEL_LABEL,
        netCents: input.grossCents,
        vatRate: 0,
        vatCents: 0,
        totalCents: input.grossCents,
        reconciliationStatus: input.orderId ? 'MATCHED' : 'UNMATCHED',
        documentRef: input.externalChargeId || ref,
        orderId: input.orderId || null,
        partnerId: input.masterPartnerId,
        entryNature: 'TRANSITO',
        settlementStatus: 'NOT_APPLICABLE',
        metadataJson: {
            channel: 'CONNECT_PARTNER',
            transitLeg: 'customer_payment',
            dareAccount: LEDGER_CONNECT_PARTNER_ACCOUNT,
            avereAccount: ACCOUNT_RICAVI_VENDITE,
            grossCents: input.grossCents,
        },
    });

    // 2) Fee partner (IVA 22%) — trattenuta all’origine = pagamento del debito
    if (input.partnerFeeCents > 0) {
        entries.push({
            sourceKey: `CONNECT_PARTNER_FEE:${ref}`,
            sourceType: 'CONNECT_MOVEMENT',
            sourceId: ref.slice(0, 128),
            direction: 'USCITA',
            category: 'COMMISSIONI_PARTNER',
            accountingDate: date,
            description: `Fee partner (Connect) — ${ref} · IVA 22%`,
            counterpartyName: 'Master partner',
            netCents: -input.partnerFeeTaxableCents,
            vatRate: 22,
            vatCents: -input.partnerFeeVatCents,
            totalCents: -input.partnerFeeCents,
            reconciliationStatus: 'MATCHED',
            documentRef: ref,
            orderId: input.orderId || null,
            partnerId: input.masterPartnerId,
            entryNature: 'ECONOMICA',
            settlementStatus: 'NOT_APPLICABLE',
            metadataJson: {
                channel: 'CONNECT_PARTNER',
                transitLeg: 'partner_fee_withholding',
                dareAccount: LEDGER_COMMISSIONI_PARTNER,
                avereAccount: LEDGER_CONNECT_PARTNER_ACCOUNT,
                partnerFeeCents: input.partnerFeeCents,
                partnerFeeTaxableCents: input.partnerFeeTaxableCents,
                partnerFeeVatCents: input.partnerFeeVatCents,
                invoiceDoesNotDoubleCost: true,
            },
        });
    }

    // 3) Commissione Stripe (senza IVA in questa gamba — reverse charge a parte se dovuto)
    if (input.stripeFeeCents > 0) {
        entries.push({
            sourceKey: `CONNECT_STRIPE_FEE:${ref}`,
            sourceType: 'CONNECT_MOVEMENT',
            sourceId: ref.slice(0, 128),
            direction: 'USCITA',
            category: 'ONERI_BANCARI',
            accountingDate: date,
            description: `Commissione Stripe su Connect — ${ref}`,
            counterpartyName: 'Stripe',
            netCents: -input.stripeFeeCents,
            vatRate: 0,
            vatCents: 0,
            totalCents: -input.stripeFeeCents,
            reconciliationStatus: 'MATCHED',
            documentRef: ref,
            orderId: input.orderId || null,
            partnerId: input.masterPartnerId,
            entryNature: 'ECONOMICA',
            settlementStatus: 'NOT_APPLICABLE',
            metadataJson: {
                channel: 'CONNECT_PARTNER',
                transitLeg: 'stripe_fee',
                dareAccount: LEDGER_COMMISSIONI_INCASSI,
                avereAccount: LEDGER_CONNECT_PARTNER_ACCOUNT,
                stripeFeeCents: input.stripeFeeCents,
            },
        });
    }

    // 4) Bonifico atteso Connect → Fineco (trasferimento, non ricavo)
    if (input.netCents > 0) {
        const payoutRef = (input.externalPayoutId || `expected:${ref}`).slice(0, 128);
        entries.push({
            sourceKey: `CONNECT_PAYOUT:${payoutRef}`,
            sourceType: 'CONNECT_MOVEMENT',
            sourceId: payoutRef,
            direction: 'USCITA',
            category: 'TRASFERIMENTO_INTERNO',
            accountingDate: date,
            description: `Payout Connect atteso → Fineco — ${ref} (€${(input.netCents / 100).toFixed(2)})`,
            counterpartyName: 'FinecoBank',
            netCents: -input.netCents,
            vatRate: 0,
            vatCents: 0,
            totalCents: -input.netCents,
            reconciliationStatus: 'UNMATCHED',
            documentRef: payoutRef,
            orderId: input.orderId || null,
            partnerId: input.masterPartnerId,
            entryNature: 'TRANSITO',
            settlementStatus: 'OPEN',
            metadataJson: {
                channel: 'CONNECT_PARTNER',
                transitLeg: 'payout_to_bank_expected',
                dareAccount: LEDGER_FINECO_ACCOUNT,
                avereAccount: LEDGER_CONNECT_PARTNER_ACCOUNT,
                expectedNetCents: input.netCents,
                orderNumber: ref,
            },
        });
    }

    return entries;
}

/**
 * Registra (o aggiorna riga DB) un incasso Connect e scrive le gambe ledger.
 * Idempotente sulle sourceKey.
 */
export async function recordConnectPartnerCharge(input: ConnectPartnerChargeInput): Promise<{
    chargeId: string;
    netCents: number;
    ledger: { inserted: number; skipped: number };
    payoutStatus: ConnectPartnerPayoutStatus;
}> {
    const orderNumber = input.orderNumber.trim();
    if (!orderNumber) throw new Error('orderNumber obbligatorio.');
    const netCents = assertAmounts(input);
    const source = input.source ?? 'MANUAL';

    const master = await prisma.partner.findFirst({
        where: { id: input.masterPartnerId, deletedAt: null },
        select: { id: true, shopName: true, partnerType: true },
    });
    if (!master) throw new Error('Master partner non trovato.');

    let orderId = input.orderId?.trim() || null;
    if (!orderId) {
        const ord = await prisma.order.findFirst({
            where: {
                OR: [{ orderNumber }, { legacyOrderNumber: orderNumber }],
                deletedAt: null,
            },
            select: { id: true },
        });
        orderId = ord?.id ?? null;
    }

    const charge = await prisma.connectPartnerCharge.upsert({
        where: { orderNumber },
        create: {
            orderId,
            orderNumber,
            masterPartnerId: input.masterPartnerId,
            externalChargeId: input.externalChargeId?.trim() || null,
            accountingDate: input.accountingDate,
            grossCents: input.grossCents,
            partnerFeeCents: input.partnerFeeCents,
            partnerFeeTaxableCents: input.partnerFeeTaxableCents,
            partnerFeeVatCents: input.partnerFeeVatCents,
            stripeFeeCents: input.stripeFeeCents,
            netCents,
            externalPayoutId: input.externalPayoutId?.trim() || null,
            payoutStatus: 'EXPECTED',
            source,
            notes: input.notes?.trim() || null,
        },
        update: {
            orderId,
            masterPartnerId: input.masterPartnerId,
            externalChargeId: input.externalChargeId?.trim() || null,
            accountingDate: input.accountingDate,
            grossCents: input.grossCents,
            partnerFeeCents: input.partnerFeeCents,
            partnerFeeTaxableCents: input.partnerFeeTaxableCents,
            partnerFeeVatCents: input.partnerFeeVatCents,
            stripeFeeCents: input.stripeFeeCents,
            netCents,
            externalPayoutId: input.externalPayoutId?.trim() || null,
            notes: input.notes?.trim() || null,
        },
    });

    if (orderId) {
        await prisma.order.update({
            where: { id: orderId },
            data: {
                paymentMethodLabel: CONNECT_PAYMENT_METHOD_LABEL,
                stripeFee: input.stripeFeeCents / 100,
                grossAmount: input.grossCents / 100,
                netAmount: netCents / 100,
                partnerCommissionCents: input.partnerFeeCents,
                partnerCommissionTaxableCents: input.partnerFeeTaxableCents,
                partnerCommissionVatCents: input.partnerFeeVatCents,
            },
        });
    }

    const ledger = await appendLedgerEntries(
        buildConnectPartnerLedgerEntries({ ...input, orderId, netCents })
    );

    // Aggiorna C14 connectCents del mese (somma trattenute fee partner)
    const ym = yearMonthFromDate(input.accountingDate);
    const monthCharges = await prisma.connectPartnerCharge.findMany({
        where: {
            masterPartnerId: input.masterPartnerId,
            accountingDate: {
                gte: new Date(Date.UTC(input.accountingDate.getUTCFullYear(), input.accountingDate.getUTCMonth(), 1)),
                lt: new Date(Date.UTC(input.accountingDate.getUTCFullYear(), input.accountingDate.getUTCMonth() + 1, 1)),
            },
            payoutStatus: { not: 'CANCELLED' },
        },
        select: { partnerFeeCents: true },
    });
    const connectCents = monthCharges.reduce((s, c) => s + c.partnerFeeCents, 0);
    await recomputePartnerFeeMonthClose({
        masterPartnerId: input.masterPartnerId,
        yearMonth: ym,
        connectCents,
    });

    return {
        chargeId: charge.id,
        netCents,
        ledger,
        payoutStatus: charge.payoutStatus,
    };
}

export async function listConnectPartnerCharges(opts?: {
    from?: Date;
    to?: Date;
    masterPartnerId?: string;
}) {
    return prisma.connectPartnerCharge.findMany({
        where: {
            ...(opts?.masterPartnerId ? { masterPartnerId: opts.masterPartnerId } : {}),
            ...(opts?.from || opts?.to
                ? {
                      accountingDate: {
                          ...(opts.from ? { gte: opts.from } : {}),
                          ...(opts.to ? { lte: opts.to } : {}),
                      },
                  }
                : {}),
        },
        include: {
            masterPartner: { select: { id: true, shopName: true } },
            order: { select: { id: true, orderNumber: true, status: true } },
        },
        orderBy: { accountingDate: 'desc' },
        take: 500,
    });
}

export type ConnectChannelSummary = {
    channel: typeof CONNECT_CHANNEL_LABEL;
    chargeCount: number;
    grossCents: number;
    partnerFeeCents: number;
    stripeFeeCents: number;
    netExpectedCents: number;
    pendingPayoutCents: number;
    accessMode: 'manual' | 'api';
};

export async function summarizeConnectPartnerChannel(): Promise<ConnectChannelSummary> {
    const rows = await prisma.connectPartnerCharge.findMany({
        where: { payoutStatus: { not: 'CANCELLED' } },
        select: {
            grossCents: true,
            partnerFeeCents: true,
            stripeFeeCents: true,
            netCents: true,
            payoutStatus: true,
            source: true,
        },
    });
    const pending = rows.filter((r) => r.payoutStatus === 'EXPECTED' || r.payoutStatus === 'PENDING');
    return {
        channel: CONNECT_CHANNEL_LABEL,
        chargeCount: rows.length,
        grossCents: rows.reduce((s, r) => s + r.grossCents, 0),
        partnerFeeCents: rows.reduce((s, r) => s + r.partnerFeeCents, 0),
        stripeFeeCents: rows.reduce((s, r) => s + r.stripeFeeCents, 0),
        netExpectedCents: rows.reduce((s, r) => s + r.netCents, 0),
        pendingPayoutCents: pending.reduce((s, r) => s + r.netCents, 0),
        accessMode: rows.some((r) => r.source === 'API') ? 'api' : 'manual',
    };
}
