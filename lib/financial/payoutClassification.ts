/**
 * Classificazione accrediti Fineco → payout gateway (Fase 2).
 * REGOLA: payout iff esiste payout id con importo+data compatibili.
 * La causale restringe i candidati, non decide.
 */

import prisma from '@/lib/prisma';
import {
    ACCOUNT_BANCA_FINECO,
    ACCOUNT_DA_CLASSIFICARE,
    ACCOUNT_BANCA_CO_PAYPAL,
    ACCOUNT_BANCA_CO_STRIPE,
    gatewayTransitAccount,
    isPayoutIdClassificationEnabled,
    type GatewayKind,
} from '@/lib/financial/chartOfAccounts';
import { LEDGER_FINECO_ACCOUNT } from '@/lib/financial/companyBankDetails';

export type PayoutClassificationKind =
    | 'PAYOUT_MATCHED'
    | 'PENDING_CLASSIFICATION'
    | 'ORDINARY';

export type PayoutClassification = {
    kind: PayoutClassificationKind;
    gateway?: GatewayKind;
    payoutId?: string;
    dareAccount: string;
    avereAccount: string;
    category: 'TRASFERIMENTO_INTERNO' | 'DA_CLASSIFICARE' | 'ALTRI_RICAVI' | 'SPESE_OPERATIVE' | 'ONERI_BANCARI' | 'IMPOSTE' | 'SPESE_SAAS' | 'COSTI_FIORISTI' | 'RICAVI_VENDITE' | 'RIMBORSI' | 'PAYPAL_PAYOUT' | 'ALTRI_COSTI' | 'CONSULENZE';
    entryNature: 'ECONOMICA' | 'FINANZIARIA' | 'TRANSITO' | null;
    settlementStatus: 'OPEN' | 'MATCHED' | 'NOT_APPLICABLE' | null;
    notes: string;
};

const CAUSALE_GATEWAY_HINT = /\b(STRIPE|PAYPAL|PAYOUT)\b/i;

function dayWindow(center: Date, daysBefore: number, daysAfter: number) {
    const from = new Date(center.getTime() - daysBefore * 24 * 60 * 60 * 1000);
    const to = new Date(center.getTime() + daysAfter * 24 * 60 * 60 * 1000);
    return { from, to };
}

function causaleHints(description: string): { preferStripe: boolean; preferPaypal: boolean; hasHint: boolean } {
    const u = description.toUpperCase();
    const preferStripe = /\bSTRIPE\b/.test(u);
    const preferPaypal = /\bPAYPAL\b/.test(u);
    const hasHint = CAUSALE_GATEWAY_HINT.test(description);
    return { preferStripe, preferPaypal, hasHint };
}

async function findStripePayoutId(amountCents: number, center: Date): Promise<string | null> {
    const { from, to } = dayWindow(center, 7, 3);
    const payout = await prisma.stripeFinanceMovement.findFirst({
        where: {
            OR: [
                { type: { equals: 'payout', mode: 'insensitive' } },
                { reportingCategory: 'payout' },
            ],
            AND: [
                {
                    OR: [
                        { amountCents: { in: [amountCents, -amountCents] } },
                        { netCents: { in: [amountCents, -amountCents] } },
                    ],
                },
                {
                    OR: [
                        { availableOn: { gte: from, lte: to } },
                        { createdAtStripe: { gte: from, lte: to } },
                    ],
                },
            ],
        },
        orderBy: { createdAtStripe: 'desc' },
        select: { payoutId: true, stripeId: true },
    });
    if (!payout) return null;
    return (payout.payoutId || payout.stripeId || '').trim() || null;
}

/** PayPal: cerca scritture ledger già etichettate come payout con stesso importo/data. */
async function findPaypalPayoutId(amountCents: number, center: Date): Promise<string | null> {
    const { from, to } = dayWindow(center, 7, 3);
    const hit = await prisma.financialLedgerEntry.findFirst({
        where: {
            reversedAt: null,
            OR: [
                { category: 'PAYPAL_PAYOUT' },
                { category: 'TRASFERIMENTO_INTERNO', sourceType: 'PAYPAL_MOVEMENT' },
            ],
            AND: [
                {
                    OR: [
                        { totalCents: { in: [-amountCents, amountCents] } },
                        { netCents: { in: [-amountCents, amountCents] } },
                    ],
                },
                { accountingDate: { gte: from, lte: to } },
            ],
        },
        orderBy: { accountingDate: 'desc' },
        select: { sourceKey: true, sourceId: true, documentRef: true, metadataJson: true },
    });
    if (!hit) return null;
    const meta = (hit.metadataJson || {}) as Record<string, unknown>;
    const fromMeta =
        (typeof meta.payoutId === 'string' && meta.payoutId) ||
        (typeof meta.paypalPayoutId === 'string' && meta.paypalPayoutId) ||
        (typeof meta.transactionId === 'string' && meta.transactionId) ||
        null;
    return (fromMeta || hit.documentRef || hit.sourceId || hit.sourceKey).trim() || null;
}

/**
 * Classifica un accredito Fineco (amountCents > 0).
 * Con flag OFF: comportamento legacy string-based (compat).
 */
export async function classifyFinecoBankCredit(input: {
    amountCents: number;
    accountingDate: Date;
    description: string;
    /** matchType già assegnato in riconciliazione (opzionale). */
    matchType?: string | null;
}): Promise<PayoutClassification> {
    const fineco = LEDGER_FINECO_ACCOUNT || ACCOUNT_BANCA_FINECO;
    const amount = input.amountCents;
    const desc = input.description || '';
    const hints = causaleHints(desc);

    if (amount <= 0) {
        return {
            kind: 'ORDINARY',
            dareAccount: '70900 - Spese operative',
            avereAccount: fineco,
            category: 'SPESE_OPERATIVE',
            entryNature: 'ECONOMICA',
            settlementStatus: 'NOT_APPLICABLE',
            notes: 'Uscita / non candidato payout',
        };
    }

    if (!isPayoutIdClassificationEnabled()) {
        // Legacy: stringa STRIPE/PAYPAL → giroconto (mantenuto dietro flag OFF)
        if (
            input.matchType === 'STRIPE_PAYOUT' ||
            input.matchType === 'PAYPAL_PAYOUT' ||
            input.matchType === 'GATEWAY_PAYOUT' ||
            /\b(STRIPE|PAYPAL)\b/i.test(desc)
        ) {
            const gateway: GatewayKind = /\bPAYPAL\b/i.test(desc) ? 'PAYPAL' : 'STRIPE';
            return {
                kind: 'PAYOUT_MATCHED',
                gateway,
                dareAccount: fineco,
                avereAccount: gatewayTransitAccount(gateway),
                category: 'TRASFERIMENTO_INTERNO',
                entryNature: 'TRANSITO',
                settlementStatus: 'MATCHED',
                notes: 'Legacy string-match (flag OFF)',
            };
        }
        return {
            kind: 'ORDINARY',
            dareAccount: fineco,
            avereAccount: ACCOUNT_RICAVI_FALLBACK(),
            category: 'ALTRI_RICAVI',
            entryNature: 'ECONOMICA',
            settlementStatus: 'NOT_APPLICABLE',
            notes: 'Legacy ordinary inflow (flag OFF)',
        };
    }

    // ——— Flag ON: decisione solo su payout id ———
    const center = input.accountingDate;

    let stripeId: string | null = null;
    let paypalId: string | null = null;

    // Causale restringe l'ordine di ricerca, non esclude l'altro gateway se assente
    if (hints.preferPaypal && !hints.preferStripe) {
        paypalId = await findPaypalPayoutId(amount, center);
        if (!paypalId) stripeId = await findStripePayoutId(amount, center);
    } else if (hints.preferStripe && !hints.preferPaypal) {
        stripeId = await findStripePayoutId(amount, center);
        if (!stripeId) paypalId = await findPaypalPayoutId(amount, center);
    } else {
        stripeId = await findStripePayoutId(amount, center);
        paypalId = stripeId ? null : await findPaypalPayoutId(amount, center);
    }

    if (stripeId) {
        return {
            kind: 'PAYOUT_MATCHED',
            gateway: 'STRIPE',
            payoutId: stripeId,
            dareAccount: fineco,
            avereAccount: ACCOUNT_BANCA_CO_STRIPE,
            category: 'TRASFERIMENTO_INTERNO',
            entryNature: 'TRANSITO',
            settlementStatus: 'MATCHED',
            notes: `Payout Stripe id=${stripeId}`,
        };
    }
    if (paypalId) {
        return {
            kind: 'PAYOUT_MATCHED',
            gateway: 'PAYPAL',
            payoutId: paypalId,
            dareAccount: fineco,
            avereAccount: ACCOUNT_BANCA_CO_PAYPAL,
            category: 'TRASFERIMENTO_INTERNO',
            entryNature: 'TRANSITO',
            settlementStatus: 'MATCHED',
            notes: `Payout PayPal id=${paypalId}`,
        };
    }

    // Causale suggerisce gateway ma nessun payout id → da classificare (mai ricavo)
    if (hints.hasHint) {
        return {
            kind: 'PENDING_CLASSIFICATION',
            dareAccount: fineco,
            avereAccount: ACCOUNT_DA_CLASSIFICARE,
            category: 'DA_CLASSIFICARE',
            entryNature: 'FINANZIARIA',
            settlementStatus: 'OPEN',
            notes: 'Causale gateway senza payout id abbinabile — da classificare',
        };
    }

    return {
        kind: 'ORDINARY',
        dareAccount: fineco,
        avereAccount: ACCOUNT_RICAVI_FALLBACK(),
        category: 'ALTRI_RICAVI',
        entryNature: 'ECONOMICA',
        settlementStatus: 'NOT_APPLICABLE',
        notes: 'Incasso ordinario senza legame gateway',
    };
}

function ACCOUNT_RICAVI_FALLBACK() {
    return '60100 - Ricavi da Vendite';
}

/** Solo lettura: applica classificazione a un campione senza persistenza. */
export async function dryRunClassifyBankLine(line: {
    id: string;
    amountCents: number;
    accountingDate: Date | null;
    valueDate: Date | null;
    description: string;
    matchType?: string | null;
}): Promise<PayoutClassification & { bankLineId: string }> {
    const d = line.accountingDate || line.valueDate || new Date();
    const result = await classifyFinecoBankCredit({
        amountCents: line.amountCents,
        accountingDate: d,
        description: line.description,
        matchType: line.matchType,
    });
    return { ...result, bankLineId: line.id };
}
