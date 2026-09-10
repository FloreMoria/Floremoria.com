/**
 * Identità fattura passiva (METODO §2): stessa P.IVA fornitore + stesso numero documento.
 * Il nome non identifica; data e imponibile sono solo conferme (discrepanze → Eccezioni).
 * Priorità canale: YouDox XML > Report XLSX > manuale.
 */

import { normalizeCanonicalVat, normalizeDocToken } from '@/lib/financial/canonicalDocumentKey';

export type PassiveIngestChannel = 'SDI_XML' | 'SDI_XLSX' | 'MANUAL' | 'UNKNOWN';

/** P.IVA fornitore normalizzata (IT…); null se assente/non utilizzabile. */
export function normalizePassiveSupplierVat(raw: string | null | undefined): string | null {
    const v = normalizeCanonicalVat(raw);
    if (!v || v === 'NOVAT') return null;
    // Solo CF italiano senza P.IVA → non usabile come identità forte
    if (/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(v.replace(/^IT/i, ''))) {
        return null;
    }
    return v;
}

/** Numero documento normalizzato (spazi tolti, upper). */
export function normalizePassiveDocNumber(raw: string | null | undefined): string | null {
    const n = normalizeDocToken(raw);
    if (!n || n === 'NONUM') return null;
    return n;
}

/** Chiave di identità: supplierVat|docNumber — senza data, senza nome. */
export function buildPassiveIdentityKey(
    supplierVat: string | null | undefined,
    docNumber: string | null | undefined
): string | null {
    const vat = normalizePassiveSupplierVat(supplierVat);
    const num = normalizePassiveDocNumber(docNumber);
    if (!vat || !num) return null;
    return `${vat}|${num}`;
}

export function resolvePassiveIngestChannel(input: {
    ingestChannel?: unknown;
    source?: unknown;
    notes?: string | null;
    fileName?: string | null;
}): PassiveIngestChannel {
    const raw = String(input.ingestChannel || input.source || '').toUpperCase();
    if (raw === 'SDI_XML' || raw.includes('SDI_XML')) return 'SDI_XML';
    if (raw === 'SDI_XLSX' || raw.includes('SDI_XLSX')) return 'SDI_XLSX';
    if (raw === 'MANUAL' || raw === 'MANUAL_EXPENSE') return 'MANUAL';

    const notes = (input.notes || '').toUpperCase();
    if (/\bSDI_XML\b/.test(notes)) return 'SDI_XML';
    if (/\bSDI_XLSX\b/.test(notes)) return 'SDI_XLSX';

    const file = (input.fileName || '').toLowerCase();
    if (file.endsWith('.xml')) return 'SDI_XML';
    if (file.endsWith('.xlsx') || file.endsWith('.csv') || /report.*fattur/i.test(file)) {
        return 'SDI_XLSX';
    }
    return 'UNKNOWN';
}

/** Rank più alto = canale prioritario. */
export function passiveChannelRank(channel: PassiveIngestChannel): number {
    if (channel === 'SDI_XML') return 30;
    if (channel === 'SDI_XLSX') return 20;
    if (channel === 'MANUAL') return 10;
    return 0;
}

export type PassiveDedupeDiscardReason =
    | 'documento già acquisito da canale prioritario'
    | 'discrepanza data/importo su stesso documento (canale inferiore)';

export type PassiveDedupeDiscard<T> = {
    item: T;
    kept: T;
    identityKey: string;
    reason: PassiveDedupeDiscardReason;
    dateMismatch: boolean;
    amountMismatch: boolean;
};

/**
 * Tiene una sola riga per identità VAT|NUM secondo priorità canale.
 * A parità di rank: preferisce la prima nell’ordine di input (caller ordina se serve).
 */
export function dedupePassiveByChannelPriority<T>(
    items: T[],
    get: (item: T) => {
        identityKey: string | null;
        channel: PassiveIngestChannel;
        /** YYYY-MM-DD opzionale — solo per segnalare discrepanza */
        documentDate?: string | null;
        /** Totale in centesimi — solo conferma */
        totalCents?: number | null;
    }
): { kept: T[]; discarded: PassiveDedupeDiscard<T>[] } {
    const bestByKey = new Map<
        string,
        {
            item: T;
            channel: PassiveIngestChannel;
            rank: number;
            date: string | null | undefined;
            total: number | null | undefined;
        }
    >();
    const order: string[] = [];
    const discarded: PassiveDedupeDiscard<T>[] = [];
    /** Righe senza identità forte: restano tutte (non fusibili in sicurezza). */
    const unkeyed: T[] = [];

    for (const item of items) {
        const meta = get(item);
        if (!meta.identityKey) {
            unkeyed.push(item);
            continue;
        }
        const rank = passiveChannelRank(meta.channel);
        const prev = bestByKey.get(meta.identityKey);
        if (!prev) {
            bestByKey.set(meta.identityKey, {
                item,
                channel: meta.channel,
                rank,
                date: meta.documentDate,
                total: meta.totalCents,
            });
            order.push(meta.identityKey);
            continue;
        }

        const dateMismatch =
            Boolean(prev.date && meta.documentDate && prev.date !== meta.documentDate);
        const amountMismatch =
            prev.total != null &&
            meta.totalCents != null &&
            Number(prev.total) !== Number(meta.totalCents);

        if (rank > prev.rank) {
            discarded.push({
                item: prev.item,
                kept: item,
                identityKey: meta.identityKey,
                reason:
                    dateMismatch || amountMismatch
                        ? 'discrepanza data/importo su stesso documento (canale inferiore)'
                        : 'documento già acquisito da canale prioritario',
                dateMismatch,
                amountMismatch,
            });
            bestByKey.set(meta.identityKey, {
                item,
                channel: meta.channel,
                rank,
                date: meta.documentDate,
                total: meta.totalCents,
            });
        } else {
            // Stesso rank o inferiore: scarta il nuovo, tieni il precedente
            discarded.push({
                item,
                kept: prev.item,
                identityKey: meta.identityKey,
                reason:
                    dateMismatch || amountMismatch
                        ? 'discrepanza data/importo su stesso documento (canale inferiore)'
                        : 'documento già acquisito da canale prioritario',
                dateMismatch,
                amountMismatch,
            });
        }
    }

    const kept = [...order.map((k) => bestByKey.get(k)!.item), ...unkeyed];
    return { kept, discarded };
}

/** Aliquote IVA italiane tipiche — usate solo per riconoscere stime errate già in archivio. */
const CANONICAL_VAT_RATES = new Set([0, 4, 5, 10, 22]);

/**
 * True se l’aliquota sembra stimata (es. 10.01 da imposta/imponibile) e non letta dalla fonte.
 */
export function looksLikeInferredVatRate(rate: number | null | undefined): boolean {
    if (rate == null || !Number.isFinite(rate)) return false;
    if (CANONICAL_VAT_RATES.has(rate)) return false;
    // Tolleranza stretta intorno alle aliquote canoniche (bug report 10.01 / 9.99)
    for (const c of CANONICAL_VAT_RATES) {
        if (c > 0 && Math.abs(rate - c) > 0 && Math.abs(rate - c) < 0.05) return true;
    }
    return false;
}
