/**
 * Bonifica scritture duplicate in Prima Nota: stesso bonifico Fineco + documenti
 * fiscali (SDI/manuale) + FLORIST_PAYOUT + JSON_ENTRY sullo stesso pagamento.
 * Soft-reverse sui duplicati — mai DELETE.
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
    buildReconciledPaymentGroups,
    enrichPrimaryWithAttachments,
    type FiscalDedupableEntry,
} from '@/lib/financial/fiscalAuthorityDedupe';

export type CleanDuplicateAccountingEntriesResult = {
    fromDate: string;
    scanned: number;
    groupsFound: number;
    reversed: number;
    metadataPatched: number;
};

function asMeta(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

const DEFAULT_FROM = new Date('2026-01-01T00:00:00.000Z');

/**
 * Identifica gruppi riconciliati (bankLineId / ordine / importo) e mantiene
 * la scrittura con autorità più alta (Fineco > compenso ordine > documento SDI).
 */
export async function cleanDuplicateAccountingEntries(opts?: {
    fromDate?: Date;
    dryRun?: boolean;
}): Promise<CleanDuplicateAccountingEntriesResult> {
    const fromDate = opts?.fromDate || DEFAULT_FROM;
    const dryRun = opts?.dryRun ?? false;
    const now = new Date();

    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            accountingDate: { gte: fromDate },
            reversedAt: null,
        },
        orderBy: [{ accountingDate: 'desc' }, { createdAt: 'desc' }],
        take: 15000,
    });

    const dedupable: FiscalDedupableEntry[] = rows.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        sourceKey: r.sourceKey,
        orderId: r.orderId,
        documentRef: r.documentRef,
        accountingDate: r.accountingDate,
        totalCents: r.totalCents,
        direction: r.direction,
        category: r.category,
        bankLineId: r.bankLineId,
        description: r.description,
        counterpartyName: r.counterpartyName,
        attachmentUrl: r.attachmentUrl,
        metadataJson: r.metadataJson,
    }));

    const groups = buildReconciledPaymentGroups(dedupable);
    let reversed = 0;
    let metadataPatched = 0;

    for (const group of groups) {
        if (group.members.length < 2) continue;

        const enriched = enrichPrimaryWithAttachments(group.primary, group.members);
        const loserIds = group.members
            .map((m) => m.id)
            .filter((id): id is string => Boolean(id && id !== group.primary.id));

        if (!dryRun && group.primary.id) {
            const existing = await prisma.financialLedgerEntry.findUnique({
                where: { id: group.primary.id },
                select: { metadataJson: true },
            });
            if (existing) {
                await prisma.financialLedgerEntry.update({
                    where: { id: group.primary.id },
                    data: {
                        metadataJson: {
                            ...asMeta(existing.metadataJson),
                            ...(enriched.metadataJson as Record<string, unknown>),
                        } as Prisma.InputJsonValue,
                        reconciliationStatus: 'MATCHED',
                    },
                });
                metadataPatched += 1;
            }
        }

        for (const id of loserIds) {
            if (dryRun) {
                reversed += 1;
                continue;
            }
            const row = await prisma.financialLedgerEntry.findUnique({
                where: { id },
                select: { reversedAt: true, metadataJson: true },
            });
            if (!row || row.reversedAt) continue;
            await prisma.financialLedgerEntry.update({
                where: { id },
                data: {
                    reversedAt: now,
                    metadataJson: {
                        ...asMeta(row.metadataJson),
                        sanitizeReason: 'reconciled_payment_dedup',
                        sanitizedAt: now.toISOString(),
                        consolidatedInto: group.primary.id,
                    },
                },
            });
            reversed += 1;
        }
    }

    return {
        fromDate: fromDate.toISOString().slice(0, 10),
        scanned: rows.length,
        groupsFound: groups.filter((g) => g.members.length >= 2).length,
        reversed,
        metadataPatched,
    };
}
