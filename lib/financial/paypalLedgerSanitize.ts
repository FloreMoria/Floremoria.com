/**
 * Sanificazione Libro Mastro: deduplica movimenti PayPal (API / Webhook / CSV).
 * Correzioni = reversedAt (mai DELETE duro sul registro permanente).
 */

import prisma from '@/lib/prisma';
import {
    inferPaypalKindFromCategory,
    normalizePaypalTransactionId,
    parsePaypalSourceKey,
    paypalCanonicalSourceKey,
    type PaypalLedgerKind,
} from '@/lib/financial/paypalSourceKeys';

export type PaypalSanitizeResult = {
    scanned: number;
    reversed: number;
    renamed: number;
    kept: number;
    groupsCollapsed: number;
};

type PaypalRow = {
    id: string;
    sourceKey: string;
    sourceId: string;
    category: string;
    accountingDate: Date;
    totalCents: number;
    netCents: number;
    description: string;
    documentRef: string | null;
    metadataJson: unknown;
    createdAt: Date;
};

function asMeta(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function keepScore(r: PaypalRow): number {
    const meta = asMeta(r.metadataJson);
    let s = 0;
    if (meta.syncedFromApi) s += 30;
    if (meta.webhook) s += 20;
    if (meta.csvImport) s += 10;
    if (r.description) s += Math.min(8, Math.floor(r.description.length / 40));
    if (r.documentRef) s += 2;
    // Preferisci la prima scrittura (cronologia)
    s += Math.max(0, 5 - Math.floor((Date.now() - r.createdAt.getTime()) / (864e5 * 30)));
    return s;
}

function resolveKindAndId(r: PaypalRow): {
    kind: PaypalLedgerKind;
    transactionId: string;
    canonicalKey: string;
} | null {
    const parsed = parsePaypalSourceKey(r.sourceKey);
    if (parsed?.transactionId) {
        return {
            kind: parsed.kind,
            transactionId: parsed.transactionId,
            canonicalKey: parsed.canonicalKey,
        };
    }

    const meta = asMeta(r.metadataJson);
    const fromMeta =
        normalizePaypalTransactionId(
            (typeof meta.transactionId === 'string' && meta.transactionId) ||
                (typeof meta.paypalTransactionId === 'string' && meta.paypalTransactionId) ||
                null
        ) || normalizePaypalTransactionId(r.documentRef) ||
        normalizePaypalTransactionId(r.sourceId);

    if (!fromMeta) return null;

    const kind = inferPaypalKindFromCategory(r.category, {
        isRefund: Boolean(meta.isRefund),
        totalCents: r.totalCents,
    });
    return {
        kind,
        transactionId: fromMeta,
        canonicalKey: paypalCanonicalSourceKey(kind, fromMeta),
    };
}

/**
 * Scansiona tutte le scritture PayPal attive, unifica su sourceKey canonica
 * e collassa anche doppioni data+importo+tipo senza ID allineato.
 */
export async function sanitizePaypalLedgerDuplicates(): Promise<PaypalSanitizeResult> {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            sourceType: 'PAYPAL_MOVEMENT',
            reversedAt: null,
        },
        select: {
            id: true,
            sourceKey: true,
            sourceId: true,
            category: true,
            accountingDate: true,
            totalCents: true,
            netCents: true,
            description: true,
            documentRef: true,
            metadataJson: true,
            createdAt: true,
        },
        take: 8000,
        orderBy: { createdAt: 'asc' },
    });

    const result: PaypalSanitizeResult = {
        scanned: rows.length,
        reversed: 0,
        renamed: 0,
        kept: 0,
        groupsCollapsed: 0,
    };
    if (!rows.length) return result;

    const byCanonical = new Map<string, PaypalRow[]>();
    const unresolved: PaypalRow[] = [];

    for (const r of rows) {
        const resolved = resolveKindAndId(r);
        if (!resolved) {
            unresolved.push(r);
            continue;
        }
        const list = byCanonical.get(resolved.canonicalKey) || [];
        list.push(r);
        byCanonical.set(resolved.canonicalKey, list);
    }

    const now = new Date();
    const idsToReverse: string[] = [];
    const renameOps: Array<{ id: string; sourceKey: string; sourceId: string }> = [];

    for (const [canonicalKey, group] of byCanonical) {
        if (group.length === 1) {
            const only = group[0];
            if (only.sourceKey !== canonicalKey) {
                // Verifica che la chiave canonica non sia già presa (anche reversed)
                const clash = await prisma.financialLedgerEntry.findUnique({
                    where: { sourceKey: canonicalKey },
                    select: { id: true, reversedAt: true },
                });
                if (!clash || clash.id === only.id) {
                    renameOps.push({
                        id: only.id,
                        sourceKey: canonicalKey,
                        sourceId: normalizePaypalTransactionId(only.sourceId).slice(0, 128) ||
                            only.sourceId.slice(0, 128),
                    });
                    result.renamed += 1;
                }
            }
            result.kept += 1;
            continue;
        }

        result.groupsCollapsed += 1;
        const ranked = [...group].sort((a, b) => keepScore(b) - keepScore(a));
        const winner = ranked[0];
        result.kept += 1;

        if (winner.sourceKey !== canonicalKey) {
            const clash = await prisma.financialLedgerEntry.findUnique({
                where: { sourceKey: canonicalKey },
                select: { id: true },
            });
            if (!clash || clash.id === winner.id || ranked.some((x) => x.id === clash.id)) {
                // Se clash è un loser del gruppo, lo rinominiamo dopo averlo stornato
                if (clash && clash.id !== winner.id) {
                    idsToReverse.push(clash.id);
                }
                renameOps.push({
                    id: winner.id,
                    sourceKey: canonicalKey,
                    sourceId:
                        normalizePaypalTransactionId(winner.sourceId).slice(0, 128) ||
                        winner.sourceId.slice(0, 128),
                });
                result.renamed += 1;
            }
        }

        for (const loser of ranked.slice(1)) {
            if (loser.id === winner.id) continue;
            idsToReverse.push(loser.id);
        }
    }

    // Secondo passaggio: data + importo netto + tipo, solo su unresolved o residui non raggruppati
    const survivors = rows.filter((r) => !idsToReverse.includes(r.id));
    const byDayAmountKind = new Map<string, PaypalRow[]>();
    for (const r of survivors) {
        const resolved = resolveKindAndId(r);
        const kind = resolved?.kind || inferPaypalKindFromCategory(r.category);
        const key = `${dayKey(r.accountingDate)}|${r.netCents}|${kind}`;
        const list = byDayAmountKind.get(key) || [];
        list.push(r);
        byDayAmountKind.set(key, list);
    }

    for (const group of byDayAmountKind.values()) {
        if (group.length < 2) continue;
        // Collassa solo se almeno due hanno ID diversi ma stesso giorno/importo/tipo
        const ids = new Set(
            group
                .map((g) => resolveKindAndId(g)?.transactionId || '')
                .filter(Boolean)
        );
        const allHaveId = group.every((g) => Boolean(resolveKindAndId(g)?.transactionId));
        if (allHaveId && ids.size === group.length) {
            // ID tutti distinti → eventi diversi con stesso importo/giorno: non toccare
            continue;
        }
        if (allHaveId && ids.size === 1) {
            // Stesso ID già gestito dal primo passaggio
            continue;
        }
        // Almeno un ID mancante/ambiguo: tieni il migliore
        result.groupsCollapsed += 1;
        const ranked = [...group].sort((a, b) => keepScore(b) - keepScore(a));
        for (const loser of ranked.slice(1)) {
            if (!idsToReverse.includes(loser.id)) idsToReverse.push(loser.id);
        }
    }

    const uniqueReverse = [...new Set(idsToReverse)];
    if (uniqueReverse.length) {
        await prisma.financialLedgerEntry.updateMany({
            where: { id: { in: uniqueReverse }, reversedAt: null },
            data: { reversedAt: now },
        });
        result.reversed = uniqueReverse.length;
    }

    for (const op of renameOps) {
        if (uniqueReverse.includes(op.id)) continue;
        try {
            await prisma.financialLedgerEntry.update({
                where: { id: op.id },
                data: {
                    sourceKey: op.sourceKey,
                    sourceId: op.sourceId,
                    metadataJson: {
                        ...asMeta(
                            rows.find((r) => r.id === op.id)?.metadataJson
                        ),
                        paypalCanonicalized: true,
                        paypalCanonicalKey: op.sourceKey,
                    },
                },
            });
        } catch {
            // Unique race: storno il record invece di lasciare chiave legacy
            await prisma.financialLedgerEntry.update({
                where: { id: op.id },
                data: { reversedAt: now },
            });
            result.reversed += 1;
            result.renamed = Math.max(0, result.renamed - 1);
        }
    }

    result.kept = Math.max(0, result.scanned - result.reversed);
    return result;
}

/** True se esiste già una scrittura attiva per una delle alias della chiave. */
export async function paypalCanonicalAlreadyRecorded(
    kind: PaypalLedgerKind,
    transactionId: string
): Promise<boolean> {
    const { paypalSourceKeyAliases } = await import('@/lib/financial/paypalSourceKeys');
    const aliases = paypalSourceKeyAliases(kind, transactionId);
    if (!aliases.length) return false;
    const hit = await prisma.financialLedgerEntry.findFirst({
        where: {
            sourceKey: { in: aliases },
            reversedAt: null,
        },
        select: { id: true },
    });
    return Boolean(hit);
}
