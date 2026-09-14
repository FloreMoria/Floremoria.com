/**
 * Incrocio automatico (sola lettura) tra ordini fiorista e fatture passive SDI/YouDOX.
 * Nessuna scrittura DB: la conferma resta un'azione esplicita dell'utente.
 *
 * Regole chiave:
 * - Dedup fatture per identità P.IVA|numero (canale SDI_XML > XLSX > MANUAL)
 * - VAT_AMOUNT / NAME_AMOUNT: 1 fattura → 1 ordine, assegnazione per distanza date
 * - ORDER_REF / VAT_AGGREGATED restano le sole eccezioni multi-legittime
 * - Non usare causali bonifico (scritte a mano, spesso errate)
 */

import prisma from '@/lib/prisma';
import {
    buildPassiveIdentityKey,
    dedupePassiveByChannelPriority,
    resolvePassiveIngestChannel,
    type PassiveIngestChannel,
} from '@/lib/financial/passiveInvoiceIdentity';

export type FloristInvoiceMatch = {
    expenseId: string;
    invoiceNumber: string | null;
    invoiceDate: string; // YYYY-MM-DD
    totalCents: number;
    vendorName: string;
    vendorVat: string | null;
    confidence: 'ORDER_REF' | 'VAT_AMOUNT' | 'VAT_AGGREGATED' | 'NAME_AMOUNT';
    /** Distanza assoluta ordine↔fattura in giorni (utile in UI/log). */
    dateDistanceDays?: number;
};

export type FloristInvoiceMatchOrderInput = {
    id: string;
    orderNumber: string | null;
    partnerId: string | null;
    partnerVat: string | null;
    partnerName: string;
    amountCents: number;
    referenceDate: Date;
};

function normalizeVat(raw: string | null | undefined): string {
    return (raw || '').replace(/^IT/i, '').replace(/\D/g, '');
}

/** Confronta numeri ordine ignorando spazi/trattini e case. */
export function normalizeOrderRef(raw: string | null | undefined): string {
    return (raw || '').toUpperCase().replace(/[\s\-_.#]/g, '');
}

export function normalizeName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

export function namesCompatible(a: string, b: string): boolean {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    if (na.includes(nb) || nb.includes(na)) return true;
    const tokens = na.split(' ').filter((t) => t.length > 3);
    return tokens.some((t) => nb.includes(t));
}

function toDateOnlyIso(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
    const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function withinInvoiceWindow(referenceDate: Date, expenseDate: Date): boolean {
    const delta = daysBetween(referenceDate, expenseDate);
    return delta >= -5 && delta <= 120;
}

function readMeta(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') return {};
    return raw as Record<string, unknown>;
}

function expenseSearchBlob(exp: {
    description: string;
    notes: string | null;
    metadataJson: unknown;
}): string {
    const meta = readMeta(exp.metadataJson);
    let metaText = '';
    try {
        metaText = JSON.stringify(meta);
    } catch {
        metaText = '';
    }
    return `${exp.description || ''}\n${exp.notes || ''}\n${metaText}`;
}

function expenseMentionsOrder(blob: string, orderNumber: string | null): boolean {
    if (!orderNumber || orderNumber.trim().length < 5) return false;
    const needle = normalizeOrderRef(orderNumber);
    if (needle.length < 5) return false;
    const hay = normalizeOrderRef(blob);
    if (hay.includes(needle)) return true;
    return blob.toUpperCase().includes(orderNumber.trim().toUpperCase());
}

function extractVendorVat(meta: Record<string, unknown>): string | null {
    const raw =
        (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
        (typeof meta.cedenteVat === 'string' && meta.cedenteVat) ||
        (typeof meta.vatNumber === 'string' && meta.vatNumber) ||
        null;
    const digits = normalizeVat(raw);
    return digits || null;
}

function extractInvoiceNumber(meta: Record<string, unknown>): string | null {
    const raw =
        (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
        (typeof meta.documentNumber === 'string' && meta.documentNumber) ||
        (typeof meta.numero === 'string' && meta.numero) ||
        null;
    return raw ? String(raw).trim() || null : null;
}

type ExpenseRow = {
    id: string;
    vendorName: string;
    totalCents: number;
    expenseDate: Date;
    description: string;
    notes: string | null;
    metadataJson: unknown;
    fileName: string | null;
    vendorVat: string | null;
    invoiceNumber: string | null;
    identityKey: string | null;
    channel: PassiveIngestChannel;
    blob: string;
};

function toMatch(
    exp: ExpenseRow,
    confidence: FloristInvoiceMatch['confidence'],
    dateDistanceDays?: number
): FloristInvoiceMatch {
    return {
        expenseId: exp.id,
        invoiceNumber: exp.invoiceNumber,
        invoiceDate: toDateOnlyIso(exp.expenseDate),
        totalCents: Math.abs(exp.totalCents),
        vendorName: exp.vendorName,
        vendorVat: exp.vendorVat,
        confidence,
        dateDistanceDays,
    };
}

function logMatch(
    order: FloristInvoiceMatchOrderInput,
    match: FloristInvoiceMatch
): void {
    console.info('[floristInvoiceAutoMatch]', {
        orderNumber: order.orderNumber,
        invoiceNumber: match.invoiceNumber,
        confidence: match.confidence,
        dateDistanceDays: match.dateDistanceDays ?? null,
        expenseId: match.expenseId,
        invoiceDate: match.invoiceDate,
    });
}

type ConsumeTracker = {
    usedExpenseIds: Set<string>;
    usedIdentityKeys: Set<string>;
};

function isConsumed(exp: ExpenseRow, tracker: ConsumeTracker): boolean {
    if (tracker.usedExpenseIds.has(exp.id)) return true;
    if (exp.identityKey && tracker.usedIdentityKeys.has(exp.identityKey)) return true;
    return false;
}

function consume(exp: ExpenseRow, tracker: ConsumeTracker): void {
    tracker.usedExpenseIds.add(exp.id);
    if (exp.identityKey) tracker.usedIdentityKeys.add(exp.identityKey);
}

function vatCompatible(orderVat: string, invVat: string): boolean {
    if (orderVat.length < 8 || invVat.length < 8) return false;
    return invVat === orderVat || invVat.includes(orderVat) || orderVat.includes(invVat);
}

/**
 * Assegna 1-a-1 le coppie compatibili, dalla distanza data più piccola alla più grande.
 */
function assignByNearestDate(params: {
    orders: FloristInvoiceMatchOrderInput[];
    expenses: ExpenseRow[];
    uncovered: Set<string>;
    tracker: ConsumeTracker;
    confidence: 'VAT_AMOUNT' | 'NAME_AMOUNT';
    result: Map<string, FloristInvoiceMatch>;
    compatible: (
        order: FloristInvoiceMatchOrderInput,
        exp: ExpenseRow
    ) => boolean;
}): void {
    type Pair = {
        order: FloristInvoiceMatchOrderInput;
        exp: ExpenseRow;
        distance: number;
    };
    const pairs: Pair[] = [];
    for (const order of params.orders) {
        if (!params.uncovered.has(order.id)) continue;
        for (const exp of params.expenses) {
            if (isConsumed(exp, params.tracker)) continue;
            if (!params.compatible(order, exp)) continue;
            if (!withinInvoiceWindow(order.referenceDate, exp.expenseDate)) continue;
            const distance = Math.abs(daysBetween(order.referenceDate, exp.expenseDate));
            pairs.push({ order, exp, distance });
        }
    }
    pairs.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        // Tie-break stabile: fattura più recente, poi orderNumber
        const td = b.exp.expenseDate.getTime() - a.exp.expenseDate.getTime();
        if (td !== 0) return td;
        return String(a.order.orderNumber || '').localeCompare(String(b.order.orderNumber || ''));
    });

    for (const pair of pairs) {
        if (!params.uncovered.has(pair.order.id)) continue;
        if (isConsumed(pair.exp, params.tracker)) continue;
        const match = toMatch(pair.exp, params.confidence, pair.distance);
        params.result.set(pair.order.id, match);
        consume(pair.exp, params.tracker);
        params.uncovered.delete(pair.order.id);
        logMatch(pair.order, match);
    }
}

/**
 * Indice orderId → fattura passiva abbinata.
 * Priorità: ORDER_REF → VAT_AMOUNT (nearest date) → VAT_AGGREGATED → NAME_AMOUNT (nearest date).
 */
export async function buildFloristInvoiceMatchIndex(params: {
    orders: FloristInvoiceMatchOrderInput[];
    year?: number;
}): Promise<Map<string, FloristInvoiceMatch>> {
    const result = new Map<string, FloristInvoiceMatch>();
    if (!params.orders.length) return result;

    const year = params.year ?? new Date().getFullYear();
    const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));

    const rawExpenses = await prisma.manualFinanceExpense.findMany({
        where: {
            docType: { in: ['FATTURA'] },
            expenseDate: { gte: from },
            OR: [{ verificationStatus: null }, { verificationStatus: 'CERTIFIED' }],
        },
        select: {
            id: true,
            vendorName: true,
            totalCents: true,
            expenseDate: true,
            description: true,
            notes: true,
            metadataJson: true,
            fileName: true,
        },
        take: 8000,
    });

    const mapped: ExpenseRow[] = rawExpenses.map((e) => {
        const meta = readMeta(e.metadataJson);
        const vendorVat = extractVendorVat(meta);
        const invoiceNumber = extractInvoiceNumber(meta);
        const channel = resolvePassiveIngestChannel({
            ingestChannel: meta.ingestChannel ?? meta.source ?? meta.passiveChannel,
            source: meta.source,
            notes: e.notes,
            fileName: e.fileName,
        });
        return {
            id: e.id,
            vendorName: e.vendorName,
            totalCents: Math.abs(e.totalCents),
            expenseDate: e.expenseDate,
            description: e.description,
            notes: e.notes,
            metadataJson: e.metadataJson,
            fileName: e.fileName,
            vendorVat,
            invoiceNumber,
            identityKey: buildPassiveIdentityKey(vendorVat, invoiceNumber),
            channel,
            blob: expenseSearchBlob(e),
        };
    });

    // Una sola fattura per identità documento (canale più affidabile)
    const { kept } = dedupePassiveByChannelPriority(mapped, (item) => ({
        identityKey: item.identityKey,
        channel: item.channel,
        documentDate: toDateOnlyIso(item.expenseDate),
        totalCents: item.totalCents,
    }));
    const expenses = kept;

    const tracker: ConsumeTracker = {
        usedExpenseIds: new Set(),
        usedIdentityKeys: new Set(),
    };
    const uncovered = new Set(params.orders.map((o) => o.id));
    const byId = new Map(params.orders.map((o) => [o.id, o]));

    // 1) ORDER_REF — numero ordine citato nella fattura (non nelle causali bonifico)
    for (const order of params.orders) {
        if (!uncovered.has(order.id)) continue;
        let best: { exp: ExpenseRow; distance: number } | null = null;
        for (const exp of expenses) {
            if (isConsumed(exp, tracker)) continue;
            if (!expenseMentionsOrder(exp.blob, order.orderNumber)) continue;
            const distance = Math.abs(daysBetween(order.referenceDate, exp.expenseDate));
            if (!best || distance < best.distance) best = { exp, distance };
        }
        if (!best) continue;
        const match = toMatch(best.exp, 'ORDER_REF', best.distance);
        result.set(order.id, match);
        consume(best.exp, tracker);
        uncovered.delete(order.id);
        logMatch(order, match);
    }

    // 2) VAT_AMOUNT — 1:1, nearest date
    assignByNearestDate({
        orders: params.orders,
        expenses,
        uncovered,
        tracker,
        confidence: 'VAT_AMOUNT',
        result,
        compatible: (order, exp) => {
            const orderVat = normalizeVat(order.partnerVat);
            const invVat = exp.vendorVat || '';
            if (!vatCompatible(orderVat, invVat)) return false;
            return Math.abs(exp.totalCents - Math.abs(order.amountCents)) <= 100;
        },
    });

    // 3) VAT_AGGREGATED — stessa P.IVA, totale = somma di ≥2 ordini scoperti
    const byVat = new Map<string, FloristInvoiceMatchOrderInput[]>();
    for (const order of params.orders) {
        if (!uncovered.has(order.id)) continue;
        const vat = normalizeVat(order.partnerVat);
        if (vat.length < 8) continue;
        const list = byVat.get(vat) || [];
        list.push(order);
        byVat.set(vat, list);
    }

    for (const [vat, group] of byVat) {
        if (group.length < 2) continue;
        const sorted = [...group].sort(
            (a, b) => a.referenceDate.getTime() - b.referenceDate.getTime()
        );
        for (const exp of expenses) {
            if (isConsumed(exp, tracker)) continue;
            const invVat = exp.vendorVat || '';
            if (!vatCompatible(vat, invVat)) continue;

            const candidates = sorted.filter(
                (o) => uncovered.has(o.id) && withinInvoiceWindow(o.referenceDate, exp.expenseDate)
            );
            if (candidates.length < 2) continue;

            let bestSubset: FloristInvoiceMatchOrderInput[] | null = null;
            const tryGreedy = (start: number) => {
                const subset: FloristInvoiceMatchOrderInput[] = [];
                let sum = 0;
                for (let i = start; i < candidates.length; i++) {
                    const next = candidates[i]!;
                    const add = Math.abs(next.amountCents);
                    if (sum + add > exp.totalCents + 100) continue;
                    subset.push(next);
                    sum += add;
                    if (Math.abs(sum - exp.totalCents) <= 100 && subset.length >= 2) {
                        return subset;
                    }
                }
                return null;
            };
            for (let i = 0; i < candidates.length; i++) {
                const hit = tryGreedy(i);
                if (hit) {
                    bestSubset = hit;
                    break;
                }
            }
            if (!bestSubset) continue;

            consume(exp, tracker);
            for (const o of bestSubset) {
                const distance = Math.abs(daysBetween(o.referenceDate, exp.expenseDate));
                const match = toMatch(exp, 'VAT_AGGREGATED', distance);
                result.set(o.id, match);
                uncovered.delete(o.id);
                logMatch(o, match);
            }
        }
    }

    // 4) NAME_AMOUNT — solo senza P.IVA partner, 1:1 nearest date
    assignByNearestDate({
        orders: params.orders,
        expenses,
        uncovered,
        tracker,
        confidence: 'NAME_AMOUNT',
        result,
        compatible: (order, exp) => {
            if (normalizeVat(order.partnerVat).length >= 8) return false;
            if (!namesCompatible(order.partnerName, exp.vendorName)) return false;
            return Math.abs(exp.totalCents - Math.abs(order.amountCents)) <= 100;
        },
    });

    // Ordini ancora scoperti restano WAITING (nessuna chiusura inventata)
    for (const id of uncovered) {
        const o = byId.get(id);
        if (!o) continue;
        console.info('[floristInvoiceAutoMatch] waiting', {
            orderNumber: o.orderNumber,
            amountCents: o.amountCents,
            referenceDate: toDateOnlyIso(o.referenceDate),
        });
    }

    return result;
}
