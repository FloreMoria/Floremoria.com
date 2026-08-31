/**
 * Operazioni DB per deduplica movimenti Fineco (merge + repoint riferimenti).
 */
import prisma from '@/lib/prisma';
import type { ParsedBankMovement } from './types';
import {
    decideImportMovement,
    deduplicateBankMovements,
    inferBankMovementSource,
    mergeBankLineMatchFields,
    movementDateIso,
    type DedupBankMovement,
    type ImportDedupDecision,
    type MergedMatchFields,
} from './deduplicateBankMovements';

export type ExistingBankLineForDedup = DedupBankMovement & {
    id: string;
    documentId: string;
};

function toMergedFields(line: {
    matchStatus: string;
    matchType: string | null;
    matchNotes: string | null;
    matchedOrderId: string | null;
    matchedTxId: string | null;
    matchScore: number | null;
}): MergedMatchFields {
    return {
        matchStatus: line.matchStatus,
        matchType: line.matchType,
        matchNotes: line.matchNotes,
        matchedOrderId: line.matchedOrderId,
        matchedTxId: line.matchedTxId,
        matchScore: line.matchScore,
    };
}

function asLedgerMeta(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

function bankLineSourceKey(lineId: string): string {
    return `BANK_LINE:${lineId}`;
}

async function findKeeperLedgerEntry(toLineId: string) {
    return prisma.financialLedgerEntry.findFirst({
        where: {
            reversedAt: null,
            OR: [{ sourceKey: bankLineSourceKey(toLineId) }, { bankLineId: toLineId }],
        },
        orderBy: { createdAt: 'asc' },
    });
}

function enrichKeeperLedgerFromDuplicate(
    keeper: {
        description: string;
        counterpartyName: string | null;
        documentRef: string | null;
        attachmentUrl: string | null;
        attachmentPath: string | null;
        reconciliationStatus: string;
        metadataJson: unknown;
    },
    duplicate: {
        description: string;
        counterpartyName: string | null;
        documentRef: string | null;
        attachmentUrl: string | null;
        attachmentPath: string | null;
        reconciliationStatus: string;
        metadataJson: unknown;
    }
) {
    const keeperMeta = asLedgerMeta(keeper.metadataJson);
    const dupMeta = asLedgerMeta(duplicate.metadataJson);
    return {
        counterpartyName: keeper.counterpartyName || duplicate.counterpartyName,
        documentRef: keeper.documentRef || duplicate.documentRef,
        attachmentUrl: keeper.attachmentUrl || duplicate.attachmentUrl,
        attachmentPath: keeper.attachmentPath || duplicate.attachmentPath,
        reconciliationStatus:
            keeper.reconciliationStatus === 'MATCHED' ||
            duplicate.reconciliationStatus === 'MATCHED'
                ? 'MATCHED'
                : keeper.reconciliationStatus,
        metadataJson: {
            ...dupMeta,
            ...keeperMeta,
            bankLineDedupMergedAt: new Date().toISOString(),
        },
    };
}

/** Carica righe esistenti nel range date/importi dei movimenti in import. */
export async function loadExistingLinesForImport(
    movements: ParsedBankMovement[]
): Promise<ExistingBankLineForDedup[]> {
    const dates = movements
        .map((m) => m.accountingDate || m.valueDate)
        .filter((d): d is string => Boolean(d));
    if (dates.length === 0 && movements.length === 0) return [];

    const sorted = [...dates].sort();
    const minDate = new Date(`${sorted[0] || '2000-01-01'}T00:00:00.000Z`);
    minDate.setUTCDate(minDate.getUTCDate() - 3);
    const maxDate = new Date(`${sorted[sorted.length - 1] || '2100-12-31'}T23:59:59.999Z`);
    maxDate.setUTCDate(maxDate.getUTCDate() + 3);

    const amounts = [...new Set(movements.map((m) => m.amountCents))];

    const rows = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { in: amounts },
            OR: [
                { accountingDate: { gte: minDate, lte: maxDate } },
                { valueDate: { gte: minDate, lte: maxDate } },
            ],
        },
        include: {
            document: {
                select: {
                    fileName: true,
                    contentType: true,
                    metadataJson: true,
                },
            },
        },
        take: 20000,
    });

    return rows.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        dateIso: movementDateIso(row.accountingDate, row.valueDate),
        amountCents: row.amountCents,
        description: row.description,
        source: inferBankMovementSource({
            fileName: row.document.fileName,
            contentType: row.document.contentType,
            metadataJson: row.document.metadataJson,
        }),
        matchStatus: row.matchStatus,
        matchType: row.matchType,
        matchNotes: row.matchNotes,
        matchedOrderId: row.matchedOrderId,
        matchedTxId: row.matchedTxId,
        matchScore: row.matchScore,
        fingerprint: row.fingerprint,
    }));
}

export async function repointBankLineReferences(
    fromLineId: string,
    toLineId: string
): Promise<{ ledgerEntries: number; ledgerReversed: number; manualExpenses: number }> {
    const now = new Date();
    let keeperEntry = await findKeeperLedgerEntry(toLineId);

    const fromEntries = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [{ bankLineId: fromLineId }, { sourceKey: bankLineSourceKey(fromLineId) }],
        },
        orderBy: { createdAt: 'asc' },
    });

    let ledgerEntries = 0;
    let ledgerReversed = 0;

    for (const entry of fromEntries) {
        if (keeperEntry?.id === entry.id) continue;

        if (keeperEntry) {
            const enriched = enrichKeeperLedgerFromDuplicate(keeperEntry, entry);
            keeperEntry = await prisma.financialLedgerEntry.update({
                where: { id: keeperEntry.id },
                data: enriched,
            });

            await prisma.financialLedgerEntry.update({
                where: { id: entry.id },
                data: {
                    reversedAt: now,
                    metadataJson: {
                        ...asLedgerMeta(entry.metadataJson),
                        sanitizeReason: 'bank_line_dedup_source_key_conflict',
                        sanitizedAt: now.toISOString(),
                        consolidatedInto: keeperEntry.id,
                        supersededByBankLineId: toLineId,
                    },
                },
            });
            ledgerReversed += 1;
            continue;
        }

        keeperEntry = await prisma.financialLedgerEntry.update({
            where: { id: entry.id },
            data: {
                bankLineId: toLineId,
                sourceKey: bankLineSourceKey(toLineId),
                sourceId: toLineId,
            },
        });
        ledgerEntries += 1;
    }

    const fromExpenses = await prisma.manualFinanceExpense.findMany({
        where: { matchedStatementLineId: fromLineId },
    });
    const targetExpense = await prisma.manualFinanceExpense.findFirst({
        where: { matchedStatementLineId: toLineId },
    });

    let manualExpenses = 0;
    for (const expense of fromExpenses) {
        if (targetExpense && targetExpense.id !== expense.id) {
            await prisma.manualFinanceExpense.update({
                where: { id: targetExpense.id },
                data: {
                    notes: targetExpense.notes || expense.notes,
                    reconciled: targetExpense.reconciled || expense.reconciled,
                    metadataJson: {
                        ...(asLedgerMeta(targetExpense.metadataJson) as object),
                        mergedFromExpenseId: expense.id,
                        bankLineDedupMergedAt: now.toISOString(),
                    },
                },
            });
            await prisma.manualFinanceExpense.update({
                where: { id: expense.id },
                data: {
                    matchedStatementLineId: null,
                    reconciled: false,
                },
            });
            continue;
        }

        await prisma.manualFinanceExpense.update({
            where: { id: expense.id },
            data: { matchedStatementLineId: toLineId },
        });
        manualExpenses += 1;
    }

    return { ledgerEntries, ledgerReversed, manualExpenses };
}

export async function supersedeBankLineSafe(params: {
    supersededLineId: string;
    replacementLineId: string;
    mergeMatchFrom: MergedMatchFields;
}): Promise<void> {
    await repointBankLineReferences(params.supersededLineId, params.replacementLineId);

    const replacement = await prisma.bankStatementLine.findUnique({
        where: { id: params.replacementLineId },
    });
    if (!replacement) return;

    const merged = mergeBankLineMatchFields(toMergedFields(replacement), params.mergeMatchFrom);

    await prisma.$transaction([
        prisma.bankStatementLine.update({
            where: { id: params.replacementLineId },
            data: {
                matchStatus: merged.matchStatus,
                matchType: merged.matchType,
                matchNotes: merged.matchNotes,
                matchedOrderId: merged.matchedOrderId,
                matchedTxId: merged.matchedTxId,
                matchScore: merged.matchScore,
            },
        }),
        prisma.bankStatementLine.delete({
            where: { id: params.supersededLineId },
        }),
    ]);
}

export type PlannedImportMovement = ParsedBankMovement & {
    importDecision: ImportDedupDecision;
    mergeMatchFrom?: MergedMatchFields;
    supersedeLineId?: string;
};

/** Pianifica import con deduplica semantica oltre al fingerprint. */
export async function planBankMovementsImport(params: {
    movements: ParsedBankMovement[];
    fileName: string;
    contentType: string;
    metadataJson?: Record<string, unknown>;
    fingerprintExists: (movement: ParsedBankMovement) => boolean;
}): Promise<{
    toInsert: PlannedImportMovement[];
    skippedDuplicates: number;
    skippedByFingerprint: number;
}> {
    const source = inferBankMovementSource({
        fileName: params.fileName,
        contentType: params.contentType,
        metadataJson: params.metadataJson,
    });

    const existing = await loadExistingLinesForImport(params.movements);
    const toInsert: PlannedImportMovement[] = [];
    let skippedDuplicates = 0;
    let skippedByFingerprint = 0;

    for (const movement of params.movements) {
        if (params.fingerprintExists(movement)) {
            skippedByFingerprint += 1;
            continue;
        }

        const dateIso = movement.accountingDate || movement.valueDate || null;
        const incoming: DedupBankMovement = {
            dateIso,
            amountCents: movement.amountCents,
            description: movement.description,
            source,
            matchStatus: 'UNMATCHED',
        };

        const decision = decideImportMovement(incoming, existing);

        if (decision.action === 'skip') {
            skippedDuplicates += 1;
            continue;
        }

        if (decision.action === 'supersede') {
            toInsert.push({
                ...movement,
                importDecision: decision,
                mergeMatchFrom: decision.plan.mergeMatchFrom,
                supersedeLineId: decision.plan.supersedeLineId,
            });
            continue;
        }

        toInsert.push({
            ...movement,
            importDecision: decision,
        });
    }

    return { toInsert, skippedDuplicates, skippedByFingerprint };
}

export type CleanDuplicateBankLinesResult = {
    scanned: number;
    groups: number;
    removed: number;
    repointedLedger: number;
    reversedLedger: number;
    repointedExpenses: number;
    dryRun: boolean;
    samples: Array<{ keptId: string; removedIds: string[]; date: string; amountCents: number }>;
};

/** Pulizia one-shot duplicati storici nel DB. */
export async function cleanDuplicateBankLines(params?: {
    fromDate?: Date;
    dryRun?: boolean;
}): Promise<CleanDuplicateBankLinesResult> {
    const fromDate = params?.fromDate ?? new Date('2026-01-01T00:00:00.000Z');
    const dryRun = params?.dryRun ?? false;

    const rows = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { accountingDate: { gte: fromDate } },
                { valueDate: { gte: fromDate } },
            ],
        },
        include: {
            document: {
                select: { fileName: true, contentType: true, metadataJson: true },
            },
        },
        orderBy: { createdAt: 'asc' },
        take: 50000,
    });

    const asDedup: ExistingBankLineForDedup[] = rows.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        dateIso: movementDateIso(row.accountingDate, row.valueDate),
        amountCents: row.amountCents,
        description: row.description,
        source: inferBankMovementSource({
            fileName: row.document.fileName,
            contentType: row.document.contentType,
            metadataJson: row.document.metadataJson,
        }),
        matchStatus: row.matchStatus,
        matchType: row.matchType,
        matchNotes: row.matchNotes,
        matchedOrderId: row.matchedOrderId,
        matchedTxId: row.matchedTxId,
        matchScore: row.matchScore,
        fingerprint: row.fingerprint,
    }));

    const { kept, removed, absorbedBy } = deduplicateBankMovements(asDedup);
    const keptIds = new Set(kept.map((k) => k.id).filter(Boolean));

    const removalGroups = new Map<string, string[]>();
    for (const r of removed) {
        if (!r.id) continue;
        const keeper = absorbedBy.get(r);
        const keeperId = keeper?.id;
        if (!keeperId || !keptIds.has(keeperId)) continue;
        const list = removalGroups.get(keeperId) || [];
        list.push(r.id);
        removalGroups.set(keeperId, list);
    }

    let repointedLedger = 0;
    let reversedLedger = 0;
    let repointedExpenses = 0;
    let removedCount = 0;
    const samples: CleanDuplicateBankLinesResult['samples'] = [];

    for (const [keeperId, removedIds] of removalGroups) {
        const keeper = kept.find((k) => k.id === keeperId);
        if (!keeper) continue;

        samples.push({
            keptId: keeperId,
            removedIds,
            date: keeper.dateIso || 'nodate',
            amountCents: keeper.amountCents,
        });

        if (dryRun) {
            removedCount += removedIds.length;
            continue;
        }

        for (const removedId of removedIds) {
            const loser = asDedup.find((l) => l.id === removedId);
            if (!loser) continue;

            const merged = mergeBankLineMatchFields(
                toMergedFields({
                    matchStatus: keeper.matchStatus || 'UNMATCHED',
                    matchType: keeper.matchType ?? null,
                    matchNotes: keeper.matchNotes ?? null,
                    matchedOrderId: keeper.matchedOrderId ?? null,
                    matchedTxId: keeper.matchedTxId ?? null,
                    matchScore: keeper.matchScore ?? null,
                }),
                toMergedFields({
                    matchStatus: loser.matchStatus || 'UNMATCHED',
                    matchType: loser.matchType ?? null,
                    matchNotes: loser.matchNotes ?? null,
                    matchedOrderId: loser.matchedOrderId ?? null,
                    matchedTxId: loser.matchedTxId ?? null,
                    matchScore: loser.matchScore ?? null,
                })
            );

            await prisma.bankStatementLine.update({
                where: { id: keeperId },
                data: {
                    matchStatus: merged.matchStatus,
                    matchType: merged.matchType,
                    matchNotes: merged.matchNotes,
                    matchedOrderId: merged.matchedOrderId,
                    matchedTxId: merged.matchedTxId,
                    matchScore: merged.matchScore,
                },
            });

            const repointed = await repointBankLineReferences(removedId, keeperId);
            repointedLedger += repointed.ledgerEntries;
            reversedLedger += repointed.ledgerReversed;
            repointedExpenses += repointed.manualExpenses;

            await prisma.bankStatementLine.delete({ where: { id: removedId } });
            removedCount += 1;
        }
    }

    return {
        scanned: rows.length,
        groups: removalGroups.size,
        removed: removedCount,
        repointedLedger,
        reversedLedger,
        repointedExpenses,
        dryRun,
        samples: samples.slice(0, 20),
    };
}
