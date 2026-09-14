/**
 * Incrocio automatico (sola lettura) tra ordini fiorista e fatture passive SDI/YouDOX.
 * Nessuna scrittura DB: la conferma resta un'azione esplicita dell'utente.
 */

import prisma from '@/lib/prisma';

export type FloristInvoiceMatch = {
    expenseId: string;
    invoiceNumber: string | null;
    invoiceDate: string; // YYYY-MM-DD
    totalCents: number;
    vendorName: string;
    vendorVat: string | null;
    confidence: 'ORDER_REF' | 'VAT_AMOUNT' | 'VAT_AGGREGATED' | 'NAME_AMOUNT';
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
    // Fattura tipicamente dopo il lavoro: −5 … +120 giorni dalla data di riferimento ordine.
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
    // Anche forma con trattini originali (case-insensitive)
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
    vendorVat: string | null;
    invoiceNumber: string | null;
    blob: string;
};

function toMatch(exp: ExpenseRow, confidence: FloristInvoiceMatch['confidence']): FloristInvoiceMatch {
    return {
        expenseId: exp.id,
        invoiceNumber: exp.invoiceNumber,
        invoiceDate: toDateOnlyIso(exp.expenseDate),
        totalCents: Math.abs(exp.totalCents),
        vendorName: exp.vendorName,
        vendorVat: exp.vendorVat,
        confidence,
    };
}

/**
 * Indice orderId → fattura passiva abbinata (priorità ORDER_REF > VAT_AMOUNT > VAT_AGGREGATED > NAME_AMOUNT).
 * Ogni expenseId viene consumato al massimo una volta.
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
            // Esclude quarantena/rifiuti se valorizzati
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
        },
        take: 8000,
    });

    const expenses: ExpenseRow[] = rawExpenses.map((e) => {
        const meta = readMeta(e.metadataJson);
        return {
            id: e.id,
            vendorName: e.vendorName,
            totalCents: Math.abs(e.totalCents),
            expenseDate: e.expenseDate,
            description: e.description,
            notes: e.notes,
            metadataJson: e.metadataJson,
            vendorVat: extractVendorVat(meta),
            invoiceNumber: extractInvoiceNumber(meta),
            blob: expenseSearchBlob(e),
        };
    });

    const usedExpenseIds = new Set<string>();
    const uncovered = new Set(params.orders.map((o) => o.id));

    // 1) ORDER_REF — certo: numero ordine nel testo fattura
    for (const order of params.orders) {
        if (!uncovered.has(order.id)) continue;
        for (const exp of expenses) {
            if (usedExpenseIds.has(exp.id)) continue;
            if (!expenseMentionsOrder(exp.blob, order.orderNumber)) continue;
            result.set(order.id, toMatch(exp, 'ORDER_REF'));
            usedExpenseIds.add(exp.id);
            uncovered.delete(order.id);
            break;
        }
    }

    // 2) VAT_AMOUNT — P.IVA + importo ±1€ + finestra data
    for (const order of params.orders) {
        if (!uncovered.has(order.id)) continue;
        const orderVat = normalizeVat(order.partnerVat);
        if (orderVat.length < 8) continue;
        for (const exp of expenses) {
            if (usedExpenseIds.has(exp.id)) continue;
            const invVat = exp.vendorVat || '';
            if (invVat.length < 8) continue;
            if (!(invVat === orderVat || invVat.includes(orderVat) || orderVat.includes(invVat))) {
                continue;
            }
            if (Math.abs(exp.totalCents - Math.abs(order.amountCents)) > 100) continue;
            if (!withinInvoiceWindow(order.referenceDate, exp.expenseDate)) continue;
            result.set(order.id, toMatch(exp, 'VAT_AMOUNT'));
            usedExpenseIds.add(exp.id);
            uncovered.delete(order.id);
            break;
        }
    }

    // 3) VAT_AGGREGATED — stessa P.IVA, totale = somma di più ordini scoperti
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
        // Prova sottoinsiemi piccoli (2–6) ordinati per data: greedy best-fit
        const sorted = [...group].sort(
            (a, b) => a.referenceDate.getTime() - b.referenceDate.getTime()
        );
        for (const exp of expenses) {
            if (usedExpenseIds.has(exp.id)) continue;
            const invVat = exp.vendorVat || '';
            if (invVat.length < 8) continue;
            if (!(invVat === vat || invVat.includes(vat) || vat.includes(invVat))) continue;

            const candidates = sorted.filter(
                (o) => uncovered.has(o.id) && withinInvoiceWindow(o.referenceDate, exp.expenseDate)
            );
            if (candidates.length < 2) continue;

            let bestSubset: FloristInvoiceMatchOrderInput[] | null = null;
            // Greedy: accumula finché non supera il totale
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

            const match = toMatch(exp, 'VAT_AGGREGATED');
            usedExpenseIds.add(exp.id);
            for (const o of bestSubset) {
                result.set(o.id, match);
                uncovered.delete(o.id);
            }
        }
    }

    // 4) NAME_AMOUNT — solo senza P.IVA partner
    for (const order of params.orders) {
        if (!uncovered.has(order.id)) continue;
        if (normalizeVat(order.partnerVat).length >= 8) continue;
        for (const exp of expenses) {
            if (usedExpenseIds.has(exp.id)) continue;
            if (!namesCompatible(order.partnerName, exp.vendorName)) continue;
            if (Math.abs(exp.totalCents - Math.abs(order.amountCents)) > 100) continue;
            if (!withinInvoiceWindow(order.referenceDate, exp.expenseDate)) continue;
            result.set(order.id, toMatch(exp, 'NAME_AMOUNT'));
            usedExpenseIds.add(exp.id);
            uncovered.delete(order.id);
            break;
        }
    }

    return result;
}
