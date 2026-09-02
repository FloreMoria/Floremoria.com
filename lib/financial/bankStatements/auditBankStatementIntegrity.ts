/**
 * Audit integrità movimenti Fineco — coerenza DB vs UI, saldi, collisioni dedup.
 */
import prisma from '@/lib/prisma';
import {
    buildFinecoDedupKey,
    extractBareFinecoTrn,
    extractBeneficiaryToken,
    extractIbanToken,
} from './parseFinecoPaste';
import { descriptionsAreEquivalent } from './deduplicateBankMovements';
import { listBankStatementMovements } from './store';

export type BankIntegrityAuditResult = {
    year: number;
    dbCount: number;
    visibleCount: number;
    hiddenByUiCount: number;
    balanceAnomalies: Array<{
        documentId: string;
        lineId: string;
        date: string | null;
        expectedBalanceCents: number | null;
        actualBalanceCents: number | null;
        deltaCents: number;
    }>;
    suspiciousSameDayAmountGroups: Array<{
        date: string;
        amountCents: number;
        lineIds: string[];
        descriptions: string[];
        dedupKeys: string[];
    }>;
    duplicateNaturalKeys: Array<{
        naturalKey: string;
        lineIds: string[];
    }>;
};

function movementDateIso(
    accountingDate: Date | null,
    valueDate: Date | null
): string | null {
    const pick = accountingDate || valueDate;
    return pick ? pick.toISOString().slice(0, 10) : null;
}

export async function auditBankStatementIntegrity(params?: {
    year?: number;
}): Promise<BankIntegrityAuditResult> {
    const year = params?.year ?? new Date().getUTCFullYear();

    const dbLines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                {
                    accountingDate: {
                        gte: new Date(Date.UTC(year, 0, 1)),
                        lt: new Date(Date.UTC(year + 1, 0, 1)),
                    },
                },
                {
                    AND: [
                        { accountingDate: null },
                        {
                            valueDate: {
                                gte: new Date(Date.UTC(year, 0, 1)),
                                lt: new Date(Date.UTC(year + 1, 0, 1)),
                            },
                        },
                    ],
                },
            ],
        },
        select: {
            id: true,
            documentId: true,
            accountingDate: true,
            valueDate: true,
            amountCents: true,
            balanceCents: true,
            description: true,
            fingerprint: true,
        },
        orderBy: [{ accountingDate: 'asc' }, { valueDate: 'asc' }, { id: 'asc' }],
    });

    const { lines: visibleLines } = await listBankStatementMovements({ year });
    const visibleIds = new Set(visibleLines.map((l) => l.id));
    const hiddenByUi = dbLines.filter((l) => !visibleIds.has(l.id));

    const balanceAnomalies: BankIntegrityAuditResult['balanceAnomalies'] = [];
    const byDocument = new Map<string, typeof dbLines>();
    for (const line of dbLines) {
        const bucket = byDocument.get(line.documentId) || [];
        bucket.push(line);
        byDocument.set(line.documentId, bucket);
    }

    for (const [documentId, docLines] of byDocument) {
        const sorted = [...docLines].sort((a, b) => {
            const da = movementDateIso(a.accountingDate, a.valueDate) || '';
            const db = movementDateIso(b.accountingDate, b.valueDate) || '';
            if (da !== db) return da.localeCompare(db);
            return a.id.localeCompare(b.id);
        });

        let running: number | null = null;
        for (const line of sorted) {
            if (line.balanceCents == null) continue;
            if (running == null) {
                running = line.balanceCents;
                continue;
            }
            const expected = running + line.amountCents;
            if (Math.abs(expected - line.balanceCents) > 1) {
                balanceAnomalies.push({
                    documentId,
                    lineId: line.id,
                    date: movementDateIso(line.accountingDate, line.valueDate),
                    expectedBalanceCents: expected,
                    actualBalanceCents: line.balanceCents,
                    deltaCents: line.balanceCents - expected,
                });
            }
            running = line.balanceCents;
        }
    }

    const sameDayAmount = new Map<string, typeof dbLines>();
    for (const line of dbLines) {
        const date = movementDateIso(line.accountingDate, line.valueDate) || 'nodate';
        const key = `${date}|${line.amountCents}`;
        const bucket = sameDayAmount.get(key) || [];
        bucket.push(line);
        sameDayAmount.set(key, bucket);
    }

    const suspiciousSameDayAmountGroups: BankIntegrityAuditResult['suspiciousSameDayAmountGroups'] =
        [];
    for (const [key, group] of sameDayAmount) {
        if (group.length < 2) continue;
        const [date, amountStr] = key.split('|');
        const dedupKeys = group.map((g) =>
            buildFinecoDedupKey(
                movementDateIso(g.accountingDate, g.valueDate),
                g.amountCents,
                g.description
            )
        );
        const uniqueKeys = new Set(dedupKeys);
        if (uniqueKeys.size === group.length) {
            suspiciousSameDayAmountGroups.push({
                date,
                amountCents: Number(amountStr),
                lineIds: group.map((g) => g.id),
                descriptions: group.map((g) => g.description.slice(0, 120)),
                dedupKeys,
            });
            continue;
        }

        // Segnala anche coppie semanticamente equivalenti (dedup troppo aggressiva).
        for (let i = 0; i < group.length; i += 1) {
            for (let j = i + 1; j < group.length; j += 1) {
                const a = group[i];
                const b = group[j];
                if (
                    descriptionsAreEquivalent(
                        a.description,
                        b.description,
                        date,
                        a.amountCents
                    )
                ) {
                    suspiciousSameDayAmountGroups.push({
                        date,
                        amountCents: a.amountCents,
                        lineIds: [a.id, b.id],
                        descriptions: [a.description.slice(0, 120), b.description.slice(0, 120)],
                        dedupKeys: [dedupKeys[i], dedupKeys[j]],
                    });
                }
            }
        }
    }

    const naturalKeyMap = new Map<string, string[]>();
    for (const line of dbLines) {
        const nk = buildFinecoDedupKey(
            movementDateIso(line.accountingDate, line.valueDate),
            line.amountCents,
            line.description
        );
        const ids = naturalKeyMap.get(nk) || [];
        ids.push(line.id);
        naturalKeyMap.set(nk, ids);
    }
    const duplicateNaturalKeys = [...naturalKeyMap.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([naturalKey, lineIds]) => ({ naturalKey, lineIds }));

    const result: BankIntegrityAuditResult = {
        year,
        dbCount: dbLines.length,
        visibleCount: visibleLines.length,
        hiddenByUiCount: hiddenByUi.length,
        balanceAnomalies,
        suspiciousSameDayAmountGroups,
        duplicateNaturalKeys,
    };

    console.info('[bank-audit] Integrità movimenti Fineco', {
        year: result.year,
        dbCount: result.dbCount,
        visibleCount: result.visibleCount,
        hiddenByUiCount: result.hiddenByUiCount,
        balanceAnomalies: result.balanceAnomalies.length,
        suspiciousSameDayAmountGroups: result.suspiciousSameDayAmountGroups.length,
        duplicateNaturalKeys: result.duplicateNaturalKeys.length,
    });

    if (hiddenByUi.length > 0) {
        console.warn(
            '[bank-audit] Righe DB non visibili in tabella',
            hiddenByUi.map((l) => ({
                id: l.id,
                date: movementDateIso(l.accountingDate, l.valueDate),
                amountCents: l.amountCents,
                payee: extractBeneficiaryToken(l.description),
                iban: extractIbanToken(l.description),
                trn: extractBareFinecoTrn(l.description),
            }))
        );
    }

    if (suspiciousSameDayAmountGroups.length > 0) {
        console.warn(
            '[bank-audit] Gruppi stessa data/importo (verifica dedup)',
            suspiciousSameDayAmountGroups.slice(0, 10)
        );
    }

    if (balanceAnomalies.length > 0) {
        console.warn('[bank-audit] Anomalie saldo progressivo', balanceAnomalies.slice(0, 10));
    }

    return result;
}
