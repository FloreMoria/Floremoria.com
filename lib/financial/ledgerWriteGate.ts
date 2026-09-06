/**
 * Cancello unico di scrittura sul Registro Storico (FinancialLedgerEntry).
 * Fase 2: unica via per sync, webhook, ingest banca/SDI — classificazione payout + idempotenza.
 *
 * Regole:
 * - SKIP se esiste già scrittura attiva per lo stesso evento sorgente
 * - Mai update importi
 * - Mai sourceKey con suffisso versione/timestamp
 * - dryRun: classifica/valida senza persistenza
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
    fiscalParts,
    type LedgerEntryInput,
} from '@/lib/financial/historicalLedgerTypes';

export type LedgerCommitResult = {
    inserted: number;
    skipped: number;
    skippedDetails: Array<{ sourceKey: string; reason: string }>;
    anomalies: Array<{ sourceKey: string; message: string }>;
    /** Solo dry-run: righe che sarebbero state inserite. */
    wouldInsert?: LedgerEntryInput[];
};

const VERSIONED_SOURCE_KEY_RE = /:(v\d+|v?\d{10,})($|:)/i;

export function assertStableSourceKey(sourceKey: string): string | null {
    const key = sourceKey.slice(0, 180);
    if (VERSIONED_SOURCE_KEY_RE.test(key)) {
        return `sourceKey versionata vietata: ${key}`;
    }
    if (/:\d{13,}$/.test(key)) {
        return `sourceKey con timestamp vietata: ${key}`;
    }
    return null;
}

/** Chiavi di evento sorgente usate per idempotenza (oltre a sourceKey). */
function eventIdentityKeys(input: LedgerEntryInput): string[] {
    const keys: string[] = [`SK:${input.sourceKey}`];
    if (input.bankLineId) keys.push(`BL:${input.bankLineId}`);
    if (input.orderId && (input.sourceType === 'ORDER' || input.sourceType === 'FLORIST_PAYOUT')) {
        keys.push(`${input.sourceType}:${input.orderId}`);
    }
    if (input.sourceType === 'BANK_LINE' && input.sourceId) {
        keys.push(`BL:${input.sourceId}`);
    }
    const meta = input.metadataJson || {};
    const stripeTx =
        (typeof meta.stripeTransactionId === 'string' && meta.stripeTransactionId) ||
        (typeof meta.stripeId === 'string' && meta.stripeId) ||
        null;
    if (stripeTx && input.sourceType === 'STRIPE_MOVEMENT') {
        keys.push(`STRIPE_TX:${stripeTx}:${input.category}`);
    }
    const paypalTx =
        (typeof meta.paypalTransactionId === 'string' && meta.paypalTransactionId) ||
        (typeof meta.transactionId === 'string' && meta.transactionId) ||
        null;
    if (paypalTx && input.sourceType === 'PAYPAL_MOVEMENT') {
        keys.push(`PAYPAL_TX:${paypalTx}:${input.category}`);
    }
    return keys;
}

function toRow(
    input: LedgerEntryInput
): Prisma.FinancialLedgerEntryCreateManyInput {
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
        entryNature: input.entryNature ?? null,
        settlementStatus: input.settlementStatus ?? null,
        matchedEntryId: input.matchedEntryId ?? null,
        matchedBankLineId: input.matchedBankLineId ?? null,
    };
}

async function findActiveByEvent(input: LedgerEntryInput): Promise<{
    id: string;
    sourceKey: string;
    totalCents: number;
} | null> {
    const byKey = await prisma.financialLedgerEntry.findFirst({
        where: { sourceKey: input.sourceKey.slice(0, 180), reversedAt: null },
        select: { id: true, sourceKey: true, totalCents: true },
    });
    if (byKey) return byKey;

    if (input.bankLineId || (input.sourceType === 'BANK_LINE' && input.sourceId)) {
        const bl = input.bankLineId || input.sourceId;
        const hit = await prisma.financialLedgerEntry.findFirst({
            where: {
                reversedAt: null,
                OR: [{ bankLineId: bl }, { sourceType: 'BANK_LINE', sourceId: bl }],
            },
            select: { id: true, sourceKey: true, totalCents: true },
        });
        if (hit) return hit;
    }

    if (input.orderId && input.sourceType === 'ORDER') {
        const hit = await prisma.financialLedgerEntry.findFirst({
            where: {
                reversedAt: null,
                sourceType: 'ORDER',
                OR: [{ orderId: input.orderId }, { sourceId: input.orderId }],
            },
            select: { id: true, sourceKey: true, totalCents: true },
        });
        if (hit) return hit;
    }

    if (input.orderId && input.sourceType === 'FLORIST_PAYOUT') {
        const hit = await prisma.financialLedgerEntry.findFirst({
            where: {
                reversedAt: null,
                sourceType: 'FLORIST_PAYOUT',
                OR: [{ orderId: input.orderId }, { sourceId: input.orderId }],
            },
            select: { id: true, sourceKey: true, totalCents: true },
        });
        if (hit) return hit;
    }

    return null;
}

/**
 * Cancello unico: inserisce solo se l'evento sorgente non ha già una scrittura attiva.
 */
export async function commitLedgerEntries(
    entries: LedgerEntryInput[],
    opts?: { dryRun?: boolean }
): Promise<LedgerCommitResult> {
    const dryRun = Boolean(opts?.dryRun);
    const result: LedgerCommitResult = {
        inserted: 0,
        skipped: 0,
        skippedDetails: [],
        anomalies: [],
        wouldInsert: dryRun ? [] : undefined,
    };

    if (!entries.length) return result;

    const toInsert: LedgerEntryInput[] = [];

    for (const raw of entries) {
        const sourceKey = raw.sourceKey.slice(0, 180);
        const entry = { ...raw, sourceKey };

        const badKey = assertStableSourceKey(sourceKey);
        if (badKey) {
            result.skipped += 1;
            result.skippedDetails.push({ sourceKey, reason: badKey });
            console.warn('[ledgerWriteGate] SKIP sourceKey versionata', { sourceKey, badKey });
            continue;
        }

        const existing = await findActiveByEvent(entry);
        if (existing) {
            result.skipped += 1;
            result.skippedDetails.push({
                sourceKey,
                reason: `idempotent_skip existing=${existing.sourceKey}`,
            });
            if (existing.totalCents !== entry.totalCents) {
                const msg = `anomalia importi: existing=${existing.totalCents} incoming=${entry.totalCents} (nessun update)`;
                result.anomalies.push({ sourceKey, message: msg });
                console.warn('[ledgerWriteGate] ANOMALIA', { sourceKey, msg, eventKeys: eventIdentityKeys(entry) });
            } else {
                console.info('[ledgerWriteGate] SKIP', {
                    sourceKey,
                    existing: existing.sourceKey,
                });
            }
            continue;
        }

        toInsert.push(entry);
    }

    if (dryRun) {
        result.wouldInsert = toInsert;
        result.inserted = 0;
        return result;
    }

    if (!toInsert.length) return result;

    const rows = toInsert.map(toRow);
    try {
        const created = await prisma.financialLedgerEntry.createMany({
            data: rows,
            skipDuplicates: true,
        });
        result.inserted = created.count;
        result.skipped += Math.max(0, toInsert.length - created.count);
        if (created.count < toInsert.length) {
            for (const e of toInsert) {
                result.skippedDetails.push({
                    sourceKey: e.sourceKey,
                    reason: 'createMany_skipDuplicates',
                });
            }
        }
    } catch (err) {
        console.error('[ledgerWriteGate] createMany failed', err);
        throw err;
    }

    return result;
}

/**
 * Compatibilità: una sola entry — inserted | skipped (mai updated).
 */
export async function commitLedgerEntry(
    entry: LedgerEntryInput,
    opts?: { dryRun?: boolean }
): Promise<'inserted' | 'skipped'> {
    const r = await commitLedgerEntries([entry], opts);
    return r.inserted > 0 ? 'inserted' : 'skipped';
}
