/**
 * Modello condiviso tabella Prima Nota + drawer dettaglio.
 */

import { labelReconciliationStatusIt } from '@/lib/financial/fiscalItalianLabels';
import { CATEGORY_LABELS } from '@/lib/financial/historicalLedgerTypes';
import type { ConsolidatedFiscalAttachment } from '@/lib/financial/fiscalAuthorityDedupe';

export type PrimaNotaDisplayEntry = {
    id: string;
    date: string;
    description: string;
    dareAccount: string;
    avereAccount: string;
    amountCents: number;
    netCents: number;
    vatCents: number;
    vatRate: number;
    direction: string;
    category: string;
    counterpartyName: string | null;
    documentRef: string | null;
    sourceType: string;
    sourceId: string | null;
    sourceKey: string | null;
    orderId: string | null;
    partnerId: string | null;
    bankLineId: string | null;
    attachmentUrl: string | null;
    reconciliationStatus: string;
    isEntrata: boolean;
    sourceLabel: string;
    attachments: ConsolidatedFiscalAttachment[];
};

export const RECONCILIATION_STATUS_OPTIONS = [
    'MATCHED',
    'UNMATCHED',
    'PARTIAL',
    'N/A',
] as const;

export type ReconciliationStatusOption = (typeof RECONCILIATION_STATUS_OPTIONS)[number];

export const FONTE_OPTIONS = [
    'Gateway',
    'SDI',
    'Fineco',
    'Manuale',
    'Ordine web',
    'Compenso fiorista',
    'Fattura / spesa',
    'Prima Nota',
] as const;

export function categoryLabel(category: string): string {
    return (CATEGORY_LABELS as Record<string, string>)[category] || category || '—';
}

export function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Importo unificato con segno e colore contabile. */
export function formatSignedImporto(cents: number, isEntrata: boolean): {
    text: string;
    className: string;
} {
    const signed = isEntrata ? Math.abs(cents) : -Math.abs(cents);
    const sign = signed >= 0 ? '+' : '−';
    return {
        text: `${sign}${euro(signed)} €`,
        className: isEntrata ? 'text-emerald-700' : 'text-rose-700',
    };
}

/** Risolve aliquota IVA 10% (fiori/prodotti) vs 22% (servizi) da dato o euristica. */
export function resolveVatRate(entry: {
    vatRate?: number | null;
    vatCents: number;
    netCents: number;
    category: string;
}): 0 | 10 | 22 {
    const rate = Number(entry.vatRate || 0);
    if (rate === 10 || rate === 22) return rate;
    if (rate > 0 && rate < 15) return 10;
    if (rate >= 15) return 22;

    if (entry.netCents > 0 && entry.vatCents > 0) {
        const inferred = Math.round((entry.vatCents / entry.netCents) * 100);
        if (inferred >= 20) return 22;
        if (inferred >= 8) return 10;
    }

    if (['RICAVI_VENDITE', 'COSTI_FIORISTI', 'RIMBORSI'].includes(entry.category)) return 10;
    if (entry.vatCents === 0 && entry.netCents > 0) return 0;
    return 22;
}

export function formatVatColumn(entry: {
    vatRate?: number | null;
    vatCents: number;
    netCents: number;
    category: string;
}): { label: string; className: string } {
    const rate = resolveVatRate(entry);
    if (rate === 0 || entry.vatCents === 0) {
        return { label: 'Esente', className: 'text-slate-400' };
    }
    return {
        label: `${rate}% · € ${euro(entry.vatCents)}`,
        className: rate === 10 ? 'text-amber-800' : 'text-indigo-800',
    };
}

export function reconciliationStatusLabel(status: string): string {
    return labelReconciliationStatusIt(status);
}

/** Priorità record in dedup visiva: autorità banca/gateway > SDI > ordine > manuale. */
function dedupePriority(sourceType: string): number {
    switch (sourceType) {
        case 'BANK_LINE':
            return 100;
        case 'STRIPE_MOVEMENT':
        case 'PAYPAL_MOVEMENT':
            return 90;
        case 'MANUAL_EXPENSE':
        case 'SAAS_INVOICE':
            return 70;
        case 'FLORIST_PAYOUT':
            return 60;
        case 'ORDER':
            return 40;
        case 'JSON_ENTRY':
            return 20;
        default:
            return 30;
    }
}

/**
 * Deduplica visiva: stessa data, importo, controparte e riferimento/source_key.
 * Mantiene il record con priorità fiscale più alta.
 */
export function dedupePrimaNotaVisualEntries(
    entries: PrimaNotaDisplayEntry[]
): PrimaNotaDisplayEntry[] {
    const groups = new Map<string, PrimaNotaDisplayEntry>();

    for (const entry of entries) {
        const date = entry.date;
        const amount = entry.amountCents;
        const cp = (entry.counterpartyName || '').toLowerCase().trim();
        const ref = (
            entry.documentRef ||
            entry.sourceKey ||
            entry.sourceId ||
            ''
        )
            .toLowerCase()
            .trim();
        const key = `${date}|${amount}|${cp}|${ref}`;

        const existing = groups.get(key);
        if (!existing) {
            groups.set(key, entry);
            continue;
        }

        const keep =
            dedupePriority(entry.sourceType) > dedupePriority(existing.sourceType)
                ? entry
                : existing;
        groups.set(key, keep);
    }

    return Array.from(groups.values());
}
