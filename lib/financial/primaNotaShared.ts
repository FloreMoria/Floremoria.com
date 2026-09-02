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

export type PrimaNotaPeriodKey = 'T1' | 'T2' | 'T3' | 'T4' | 'YEAR';

export const PRIMA_NOTA_PERIOD_OPTIONS: Array<{
    key: PrimaNotaPeriodKey;
    label: string;
    months: string;
}> = [
    { key: 'T1', label: 'T1 2026 (Gen - Mar)', months: '01-03' },
    { key: 'T2', label: 'T2 2026 (Apr - Giu)', months: '04-06' },
    { key: 'T3', label: 'T3 2026 (Lug - Set)', months: '07-09' },
    { key: 'T4', label: 'T4 2026 (Ott - Dic)', months: '10-12' },
    { key: 'YEAR', label: 'Tutto il 2026', months: '01-12' },
];

export function currentPrimaNotaPeriodKey(now = new Date()): PrimaNotaPeriodKey {
    const q = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
    return `T${q}` as PrimaNotaPeriodKey;
}

export function periodBounds(
    year: number,
    key: PrimaNotaPeriodKey
): { start: string; end: string; label: string } {
    const opt = PRIMA_NOTA_PERIOD_OPTIONS.find((o) => o.key === key)!;
    if (key === 'YEAR') {
        return {
            start: `${year}-01-01`,
            end: `${year}-12-31`,
            label: `Tutto il ${year}`,
        };
    }
    const q = Number(key.slice(1));
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = new Date(year, endMonth, 0).getDate();
    const longLabel = opt.label.replace(/2026/g, String(year));
    return {
        start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
        end: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
        label: longLabel,
    };
}

export function signedMovementCents(entry: Pick<PrimaNotaDisplayEntry, 'amountCents' | 'isEntrata'>): number {
    return entry.isEntrata ? Math.abs(entry.amountCents) : -Math.abs(entry.amountCents);
}

/** Badge sintetico conto/gateway. */
export function gatewayBadge(entry: Pick<PrimaNotaDisplayEntry, 'sourceType' | 'sourceLabel' | 'sourceKey'>): {
    label: string;
    className: string;
} {
    const st = entry.sourceType || '';
    const sk = (entry.sourceKey || '').toUpperCase();
    const label = (entry.sourceLabel || '').toLowerCase();
    if (st === 'BANK_LINE' || st === 'BANK_LINE_MANUAL' || label.includes('fineco')) {
        return { label: 'Fineco', className: 'bg-sky-100 text-sky-800' };
    }
    if (st === 'STRIPE_MOVEMENT' || sk.includes('STRIPE') || label.includes('stripe')) {
        return { label: 'Stripe', className: 'bg-violet-100 text-violet-800' };
    }
    if (st === 'PAYPAL_MOVEMENT' || sk.includes('PAYPAL') || label.includes('paypal')) {
        return { label: 'PayPal', className: 'bg-amber-100 text-amber-900' };
    }
    if (st === 'MANUAL_EXPENSE' || st === 'SAAS_INVOICE' || label.includes('sdi')) {
        return { label: 'SDI', className: 'bg-slate-100 text-slate-700' };
    }
    if (st === 'FLORIST_PAYOUT') {
        return { label: 'Fiorista', className: 'bg-rose-50 text-rose-800' };
    }
    if (st === 'ORDER') {
        return { label: 'Ordine', className: 'bg-emerald-50 text-emerald-800' };
    }
    return {
        label: entry.sourceLabel?.slice(0, 12) || 'Altro',
        className: 'bg-slate-100 text-slate-600',
    };
}

/**
 * Anteprima compatta causale: beneficiario in evidenza + tipo movimento breve.
 */
export function compactCausalePreview(
    description: string,
    counterpartyName?: string | null
): { title: string; subtitle: string | null } {
    const raw = (description || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { title: '—', subtitle: null };

    const beneficiary =
        counterpartyName?.trim() ||
        raw.match(/Beneficiario\s*:\s*([^|·\n]+?)(?:\s+IBAN\b|\s+I\s*BAN\b|\s+Data\b|$)/i)?.[1]?.trim() ||
        raw.match(/\bBen\s*:\s*([^|·\n]+?)(?:\s+Ins\b|\s+IBAN\b|\s+Iban\b|$)/i)?.[1]?.trim() ||
        null;

    let kind = 'Movimento';
    if (/bonifico|beneficiario|^ben\s*:/i.test(raw)) kind = 'Bonifico';
    else if (/scontrino/i.test(raw)) kind = 'Scontrino';
    else if (/fattura/i.test(raw)) kind = 'Fattura';
    else if (/compenso fiorista/i.test(raw)) kind = 'Compenso';
    else if (/incasso|stripe|paypal|ricavo/i.test(raw)) kind = 'Incasso';
    else if (/fee|commissione|oneri/i.test(raw)) kind = 'Fee';

    if (beneficiary) {
        const name = beneficiary.replace(/\s+/g, ' ').trim().slice(0, 42);
        return { title: name, subtitle: kind };
    }

    // Senza beneficiario: primi ~48 char senza prefissi tecnici
    const cleaned = raw
        .replace(/^(Beneficiario|Ben)\s*:\s*/i, '')
        .replace(/\s+IBAN:.*$/i, '')
        .replace(/\s+Data Inserimento:.*$/i, '')
        .slice(0, 56);
    return { title: cleaned || raw.slice(0, 56), subtitle: null };
}

export function formatEuroBalance(cents: number): string {
    const sign = cents < 0 ? '−' : '';
    return `${sign}${euro(cents)} €`;
}
