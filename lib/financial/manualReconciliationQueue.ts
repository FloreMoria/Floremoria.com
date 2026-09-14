/**
 * Coda unificata righe estratto non abbinate + annullamento abbinamento manuale.
 * Perché: lavorare 90+ scoperte senza aprire un documento alla volta; i suggerimenti
 * restano on-demand (una riga) per non ripetere i timeout del sync YouDOX.
 *
 * Assumption: con volumi tipici (~100 scoperte/anno) si carica e ordina in memoria
 * (cap 500) — sotto i 10s e senza cursor keyset fragili su abs(importo).
 */

import prisma from '@/lib/prisma';
import { clearManualExpenseReconciled } from '@/lib/financial/manualExpenses';

export type PendingReconciliationLine = {
    lineId: string;
    documentId: string;
    documentFileName: string;
    accountingDate: string | null;
    valueDate: string | null;
    description: string;
    amountCents: number;
    matchStatus: string;
    matchType: string | null;
    matchNotes: string | null;
};

export type RecentManualReconciliation = {
    lineId: string;
    documentId: string;
    documentFileName: string;
    accountingDate: string | null;
    description: string;
    amountCents: number;
    matchType: string | null;
    matchNotes: string | null;
    matchedOrderId: string | null;
    updatedAt: string;
};

export type PendingReconciliationSummary = {
    unmatchedCount: number;
    inflowCents: number;
    outflowCents: number;
    oldestAccountingDate: string | null;
    documentCount: number;
};

function isoDay(d: Date | null | undefined): string | null {
    if (!d) return null;
    return d.toISOString().slice(0, 10);
}

function encodeOffsetCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url');
}

function decodeOffsetCursor(raw: string | null): number {
    if (!raw) return 0;
    try {
        const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
            o?: number;
        };
        return typeof parsed.o === 'number' && parsed.o >= 0 ? Math.floor(parsed.o) : 0;
    } catch {
        return 0;
    }
}

function yearBounds(year: number): { start: Date; end: Date } {
    return {
        start: new Date(Date.UTC(year, 0, 1)),
        end: new Date(Date.UTC(year + 1, 0, 1)),
    };
}

/** Where Prisma per righe non MATCHED nell'anno (o intervallo esplicito). */
export function buildPendingLinesWhere(params: {
    year: number;
    from?: string | null;
    to?: string | null;
    sign?: 'in' | 'out' | 'all';
    q?: string | null;
}) {
    const { start, end } = yearBounds(params.year);
    const from = params.from ? new Date(`${params.from}T00:00:00.000Z`) : start;
    const toExclusive = params.to
        ? new Date(`${params.to}T23:59:59.999Z`)
        : new Date(end.getTime() - 1);

    const dateOr = [
        { accountingDate: { gte: from, lte: toExclusive } },
        {
            AND: [
                { accountingDate: null },
                { valueDate: { gte: from, lte: toExclusive } },
            ],
        },
        {
            AND: [
                { accountingDate: null },
                { valueDate: null },
                {
                    document: {
                        OR: [
                            { periodStart: { gte: start, lt: end } },
                            { periodEnd: { gte: start, lt: end } },
                            {
                                AND: [
                                    { periodStart: null },
                                    { uploadedAt: { gte: start, lt: end } },
                                ],
                            },
                        ],
                    },
                },
            ],
        },
    ];

    const where: Record<string, unknown> = {
        matchStatus: { not: 'MATCHED' },
        OR: dateOr,
    };

    if (params.sign === 'in') where.amountCents = { gt: 0 };
    if (params.sign === 'out') where.amountCents = { lt: 0 };

    const q = (params.q || '').trim();
    if (q) {
        where.AND = [
            {
                OR: [
                    { description: { contains: q, mode: 'insensitive' } },
                    { document: { fileName: { contains: q, mode: 'insensitive' } } },
                ],
            },
        ];
    }

    return where;
}

function sortPendingLines(
    rows: Array<{
        id: string;
        accountingDate: Date | null;
        amountCents: number;
    }>,
    sort: string
) {
    const copy = [...rows];
    if (sort === 'amount' || sort === 'amount_desc') {
        copy.sort(
            (a, b) =>
                Math.abs(b.amountCents) - Math.abs(a.amountCents) || a.id.localeCompare(b.id)
        );
    } else if (sort === 'amount_asc') {
        copy.sort(
            (a, b) =>
                Math.abs(a.amountCents) - Math.abs(b.amountCents) || a.id.localeCompare(b.id)
        );
    } else if (sort === 'date_asc') {
        copy.sort((a, b) => {
            const da = a.accountingDate?.getTime() ?? Number.POSITIVE_INFINITY;
            const db = b.accountingDate?.getTime() ?? Number.POSITIVE_INFINITY;
            return da - db || a.id.localeCompare(b.id);
        });
    } else {
        // date desc (default)
        copy.sort((a, b) => {
            const da = a.accountingDate?.getTime() ?? 0;
            const db = b.accountingDate?.getTime() ?? 0;
            return db - da || a.id.localeCompare(b.id);
        });
    }
    return copy;
}

export async function listPendingReconciliation(params: {
    year?: number;
    from?: string | null;
    to?: string | null;
    sign?: 'in' | 'out' | 'all';
    q?: string | null;
    sort?: 'date' | 'amount' | 'date_asc' | 'amount_asc' | 'amount_desc';
    limit?: number;
    cursor?: string | null;
}): Promise<{
    lines: PendingReconciliationLine[];
    nextCursor: string | null;
    summary: PendingReconciliationSummary;
}> {
    const year = params.year && Number.isFinite(params.year) ? params.year : new Date().getFullYear();
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);
    const offset = decodeOffsetCursor(params.cursor || null);
    const whereFiltered = buildPendingLinesWhere({
        year,
        from: params.from,
        to: params.to,
        sign: params.sign || 'all',
        q: params.q,
    });
    // Riepilogo sempre sull'anno (senza filtri testo/segno) così il badge tab resta stabile
    const whereSummary = buildPendingLinesWhere({
        year,
        from: params.from,
        to: params.to,
        sign: 'all',
        q: null,
    });

    const [rows, summaryRows, inAgg, outAgg] = await Promise.all([
        prisma.bankStatementLine.findMany({
            where: whereFiltered as never,
            take: 500,
            select: {
                id: true,
                documentId: true,
                accountingDate: true,
                valueDate: true,
                description: true,
                amountCents: true,
                matchStatus: true,
                matchType: true,
                matchNotes: true,
                document: { select: { fileName: true } },
            },
        }),
        prisma.bankStatementLine.findMany({
            where: whereSummary as never,
            take: 500,
            select: {
                id: true,
                documentId: true,
                accountingDate: true,
                valueDate: true,
                amountCents: true,
            },
        }),
        prisma.bankStatementLine.aggregate({
            where: { AND: [whereSummary, { amountCents: { gt: 0 } }] } as never,
            _sum: { amountCents: true },
        }),
        prisma.bankStatementLine.aggregate({
            where: { AND: [whereSummary, { amountCents: { lt: 0 } }] } as never,
            _sum: { amountCents: true },
        }),
    ]);

    const sorted = sortPendingLines(rows, params.sort || 'date');
    const pageRows = sorted.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const nextCursor = nextOffset < sorted.length ? encodeOffsetCursor(nextOffset) : null;

    const oldest = [...summaryRows]
        .filter((r) => r.accountingDate || r.valueDate)
        .sort((a, b) => {
            const da = (a.accountingDate || a.valueDate)!.getTime();
            const db = (b.accountingDate || b.valueDate)!.getTime();
            return da - db;
        })[0];

    const documentIds = new Set(summaryRows.map((r) => r.documentId));

    // Mappa id → row completa dopo sort
    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines: PendingReconciliationLine[] = pageRows.map((r) => {
        const full = byId.get(r.id)!;
        return {
            lineId: full.id,
            documentId: full.documentId,
            documentFileName: full.document.fileName,
            accountingDate: isoDay(full.accountingDate),
            valueDate: isoDay(full.valueDate),
            description: full.description,
            amountCents: full.amountCents,
            matchStatus: full.matchStatus,
            matchType: full.matchType,
            matchNotes: full.matchNotes,
        };
    });

    return {
        lines,
        nextCursor,
        summary: {
            unmatchedCount: summaryRows.length,
            inflowCents: inAgg._sum.amountCents || 0,
            outflowCents: outAgg._sum.amountCents || 0,
            oldestAccountingDate: isoDay(oldest?.accountingDate || oldest?.valueDate),
            documentCount: documentIds.size,
        },
    };
}

export async function listRecentManualReconciliations(
    take = 20
): Promise<RecentManualReconciliation[]> {
    const rows = await prisma.bankStatementLine.findMany({
        where: {
            matchStatus: 'MATCHED',
            matchNotes: { startsWith: 'Riconciliato Manualmente' },
        },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(Math.max(take, 1), 50),
        select: {
            id: true,
            documentId: true,
            accountingDate: true,
            description: true,
            amountCents: true,
            matchType: true,
            matchNotes: true,
            matchedOrderId: true,
            updatedAt: true,
            document: { select: { fileName: true } },
        },
    });

    return rows.map((r) => ({
        lineId: r.id,
        documentId: r.documentId,
        documentFileName: r.document.fileName,
        accountingDate: isoDay(r.accountingDate),
        description: r.description,
        amountCents: r.amountCents,
        matchType: r.matchType,
        matchNotes: r.matchNotes,
        matchedOrderId: r.matchedOrderId,
        updatedAt: r.updatedAt.toISOString(),
    }));
}

/**
 * Riporta la riga a UNMATCHED e storna solo le scritture generate dall'abbinamento
 * (BANK_LINE_MANUAL). Non cancella BANK_LINE storica del movimento.
 */
export async function unmatchBankStatementLine(params: {
    documentId: string;
    lineId: string;
}): Promise<{
    lineId: string;
    matchedCount: number;
    unmatchedCount: number;
    reversedLedger: number;
}> {
    const line = await prisma.bankStatementLine.findFirst({
        where: { id: params.lineId, documentId: params.documentId },
    });
    if (!line) {
        throw new Error('Riga non trovata');
    }

    const expenseId =
        line.matchedTxId &&
        (line.matchType === 'SDI_INVOICE' ||
            line.matchType === 'CASH_EXPENSE' ||
            line.matchType === 'MANUAL_EXPENSE' ||
            line.matchType === 'FOREIGN_AUTOFATTURA')
            ? line.matchedTxId
            : null;

    await prisma.bankStatementLine.update({
        where: { id: line.id },
        data: {
            matchStatus: 'UNMATCHED',
            matchType: null,
            matchScore: null,
            matchedOrderId: null,
            matchedTxId: null,
            matchNotes: 'Abbinamento annullato manualmente',
        },
    });

    const now = new Date();
    const manualKey = `BANK_LINE_MANUAL:${line.id}`.slice(0, 180);
    const bankKey = `BANK_LINE:${line.id}`.slice(0, 180);

    const reversed = await prisma.financialLedgerEntry.updateMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: manualKey },
                { sourceId: line.id, sourceType: 'BANK_LINE_MANUAL' },
            ],
        },
        data: { reversedAt: now },
    });

    try {
        await prisma.financialLedgerEntry.updateMany({
            where: {
                reversedAt: null,
                OR: [{ sourceKey: bankKey }, { bankLineId: line.id, sourceType: 'BANK_LINE' }],
            },
            data: {
                reconciliationStatus: 'UNMATCHED',
                orderId: null,
            },
        });
    } catch {
        /* best-effort */
    }

    if (expenseId) {
        try {
            await clearManualExpenseReconciled(expenseId);
        } catch {
            /* best-effort */
        }
    }

    const [matchedCount, unmatchedCount] = await Promise.all([
        prisma.bankStatementLine.count({
            where: { documentId: line.documentId, matchStatus: 'MATCHED' },
        }),
        prisma.bankStatementLine.count({
            where: { documentId: line.documentId, matchStatus: { not: 'MATCHED' } },
        }),
    ]);
    await prisma.bankStatementDocument.update({
        where: { id: line.documentId },
        data: { matchedCount, unmatchedCount },
    });

    return {
        lineId: line.id,
        matchedCount,
        unmatchedCount,
        reversedLedger: reversed.count,
    };
}
