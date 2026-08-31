'use client';

/**
 * Scritture di Prima Nota da dati reali (ledger bonificato + Registro Neon).
 * Gerarchia fiscale: banca/gateway prevalgono su ordini web/manuali.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { formatFinanceDate, isFinanceSeedEntryId } from '@/lib/financial/formatFinanceDate';
import { labelSourceTypeIt } from '@/lib/financial/fiscalItalianLabels';
import { CATEGORY_LABELS } from '@/lib/financial/historicalLedgerTypes';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import type { ConsolidatedFiscalAttachment } from '@/lib/financial/fiscalAuthorityDedupe';
import type { AccountingEntry } from '@/lib/financial/types';

type NeonRow = {
    id: string;
    accountingDate: string;
    description: string;
    sourceType: string;
    sourceId: string;
    sourceKey?: string | null;
    documentRef?: string | null;
    orderId?: string | null;
    partnerId?: string | null;
    bankLineId?: string | null;
    counterpartyName?: string | null;
    attachmentUrl?: string | null;
    totalCents: number;
    netCents: number;
    vatCents: number;
    category: string;
    direction: string;
    metadataJson?: {
        dareAccount?: string;
        avereAccount?: string;
        stripeTransactionId?: string;
        displayFonte?: string;
        [key: string]: unknown;
    } | null;
};

type DisplayEntry = {
    id: string;
    date: string;
    description: string;
    dareAccount: string;
    avereAccount: string;
    amountCents: number;
    netCents: number;
    vatCents: number;
    direction: string;
    category: string;
    counterpartyName: string | null;
    documentRef: string | null;
    sourceType: string;
    sourceId: string | null;
    orderId: string | null;
    partnerId: string | null;
    bankLineId: string | null;
    attachmentUrl: string | null;
    /** true = entrata/ricavo (verde); false = uscita/costo (rosso) */
    isEntrata: boolean;
    sourceLabel: string;
    attachments: ConsolidatedFiscalAttachment[];
};

const PRIMA_NOTA_TABLE_SCROLL_CLASS =
    'dashboard-table-scroll max-h-[min(70vh,calc(2.75rem+28*2.85rem))] overflow-y-auto overflow-x-auto [scrollbar-width:thin]';

function categoryLabel(category: string): string {
    return (CATEGORY_LABELS as Record<string, string>)[category] || category || '—';
}

function truncateCell(value: string | null | undefined, max = 28): string {
    if (!value) return '—';
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function attachmentBadgeEmoji(kind: ConsolidatedFiscalAttachment['kind']): string {
    switch (kind) {
        case 'FATTURA':
            return '📄';
        case 'SCONTRINO':
            return '🧾';
        case 'COMPENSO':
            return '💐';
        default:
            return '📎';
    }
}

function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatSignedAmount(cents: number, isEntrata: boolean): {
    text: string;
    className: string;
} {
    const signed = isEntrata ? Math.abs(cents) : -Math.abs(cents);
    const sign = signed >= 0 ? '+' : '−';
    return {
        text: `${sign}€ ${euro(signed)}`,
        className: isEntrata ? 'text-emerald-700' : 'text-rose-700',
    };
}

function isEntrataFromNeon(r: NeonRow): boolean {
    if (r.direction === 'ENTRATA') return true;
    if (r.direction === 'USCITA') return false;
    return r.totalCents > 0;
}

/** Dare su cassa/banca ⇒ entrata di liquidità (verde). */
function isEntrataFromLocal(dareAccount: string, avereAccount: string): boolean {
    const dare = dareAccount.toLowerCase();
    const avere = avereAccount.toLowerCase();
    if (/banca|cassa|10100|10200/.test(dare)) return true;
    if (/banca|cassa|10100|10200/.test(avere)) return false;
    if (/ricav|60100|60900/.test(avere)) return true;
    if (/cost|spes|70100|70200|70300|70900/.test(dare)) return false;
    return true;
}

function accountsFromNeon(r: NeonRow): { dare: string; avere: string } {
    const meta = r.metadataJson || {};
    if (meta.dareAccount && meta.avereAccount) {
        return { dare: String(meta.dareAccount), avere: String(meta.avereAccount) };
    }
    const fineco = '10100 - Banca Fineco';
    const paypal = '10200 - Conto PayPal';
    const stripe = '10300 - Conto Stripe';

    // Gateway wallet vs banca fisica
    let cash = fineco;
    if (r.sourceType === 'PAYPAL_MOVEMENT' || r.category === 'PAYPAL_PAYOUT') {
        cash = paypal;
    } else if (
        r.sourceType === 'STRIPE_MOVEMENT' ||
        (typeof r.sourceKey === 'string' && r.sourceKey.includes('stripe'))
    ) {
        cash = stripe;
    } else if (r.category === 'TRASFERIMENTO_INTERNO') {
        cash = fineco;
    }

    if (r.direction === 'ENTRATA' || r.totalCents > 0) {
        return { dare: cash, avere: accountForCategory(r.category, true) };
    }
    return { dare: accountForCategory(r.category, false), avere: cash };
}

function accountForCategory(category: string, revenueSide: boolean): string {
    switch (category) {
        case 'RICAVI_VENDITE':
        case 'ALTRI_RICAVI':
            return '60100 - Ricavi da Vendite';
        case 'TRASFERIMENTO_INTERNO':
        case 'PAYPAL_PAYOUT':
            return '17100 - Conto transitorio Gateway (giroconto)';
        case 'COSTI_FIORISTI':
            return '70100 - Costi Fioristi';
        case 'SPESE_SAAS':
            return '70900 - Spese operative/SaaS';
        case 'ONERI_BANCARI':
            return '70200 - Oneri bancari / Fee gateway';
        default:
            return revenueSide ? '60900 - Altri ricavi' : '70900 - Spese operative';
    }
}

const FONTE_OPTIONS = [
    'Gateway',
    'SDI',
    'Fineco',
    'Manuale',
    'Ordine web',
    'Compenso fiorista',
    'Fattura / spesa',
    'Prima Nota',
] as const;

function sourceLabel(sourceType: string, displayFonte?: string | null): string {
    if (displayFonte) return displayFonte;
    switch (sourceType) {
        case 'ORDER':
            return 'Ordine web';
        case 'STRIPE_MOVEMENT':
        case 'PAYPAL_MOVEMENT':
            return 'Gateway';
        case 'FLORIST_PAYOUT':
            return 'Compenso fiorista';
        case 'BANK_LINE':
            return 'Fineco';
        case 'SAAS_INVOICE':
        case 'MANUAL_EXPENSE':
            return 'SDI';
        case 'JSON_ENTRY':
            return 'Manuale';
        default:
            return sourceType || 'Registro';
    }
}

type Props = {
    localEntries: AccountingEntry[];
    searchTerm?: string;
};

export default function PrimaNotaTable({ localEntries, searchTerm = '' }: Props) {
    const [neonRows, setNeonRows] = useState<NeonRow[]>([]);
    const [fonteOverrides, setFonteOverrides] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingFonteId, setEditingFonteId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const year = new Date().getFullYear();
            const res = await fetch(
                `/api/dashboard/finance/historical-ledger?year=${year}&take=5000&direction=ALL&category=ALL`
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                rows?: NeonRow[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Caricamento fallito');
            setNeonRows(parsed.data?.rows || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore');
            setNeonRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const saveFonte = async (entryId: string, fonteLabel: string) => {
        try {
            const res = await fetch('/api/dashboard/finance/historical-ledger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_fonte',
                    entryId,
                    fonteLabel,
                }),
            });
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Salvataggio fallito');
            setFonteOverrides((prev) => ({ ...prev, [entryId]: fonteLabel }));
            setNeonRows((prev) =>
                prev.map((r) =>
                    r.id === entryId
                        ? {
                              ...r,
                              metadataJson: {
                                  ...(r.metadataJson || {}),
                                  displayFonte: fonteLabel,
                              },
                          }
                        : r
                )
            );
            setEditingFonteId(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore salvataggio fonte');
        }
    };

    const rows: DisplayEntry[] = useMemo(() => {
        const cleanedNeon = neonRows.filter((r) => {
            if (r.sourceType === 'CUSTOMER_RECEIPT') return false;
            if (r.sourceType === 'JSON_ENTRY' && isFinanceSeedEntryId(r.sourceId || '')) return false;
            return true;
        });

        // Dedup già lato API; ricalcolo locale per sicurezza e per escludere JSON locali duplicati
        const fiscalRows = applyFiscalAuthorityHierarchy(
            cleanedNeon.map((r) => ({
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
            }))
        );
        const fiscalById = new Map(fiscalRows.map((r) => [r.id, r]));
        const keepNeonIds = new Set(fiscalRows.map((r) => r.id).filter(Boolean) as string[]);

        const map = new Map<string, DisplayEntry>();

        for (const r of cleanedNeon) {
            if (!keepNeonIds.has(r.id)) continue;
            const enriched = fiscalById.get(r.id);
            const meta = (enriched?.metadataJson || r.metadataJson || {}) as Record<string, unknown>;
            const attachments = Array.isArray(meta.consolidatedAttachments)
                ? (meta.consolidatedAttachments as ConsolidatedFiscalAttachment[])
                : [];
            const accounts = accountsFromNeon(r);
            map.set(r.id, {
                id: r.id,
                date: String(r.accountingDate).slice(0, 10),
                description: r.description,
                dareAccount: accounts.dare,
                avereAccount: accounts.avere,
                amountCents: Math.abs(r.totalCents || r.netCents || 0),
                netCents: Math.abs(r.netCents || r.totalCents || 0),
                vatCents: Math.abs(r.vatCents || 0),
                direction: r.direction || (r.totalCents >= 0 ? 'ENTRATA' : 'USCITA'),
                category: r.category || '—',
                counterpartyName: r.counterpartyName || null,
                documentRef: r.documentRef || null,
                sourceType: r.sourceType,
                sourceId: r.sourceId || null,
                orderId: r.orderId || null,
                partnerId: r.partnerId || null,
                bankLineId: r.bankLineId || null,
                attachmentUrl: r.attachmentUrl || null,
                isEntrata: isEntrataFromNeon(r),
                sourceLabel: sourceLabel(
                    r.sourceType,
                    fonteOverrides[r.id] ||
                        (typeof meta.displayFonte === 'string' ? meta.displayFonte : null)
                ),
                attachments,
            });
        }

        const combinedForLocalFilter = applyFiscalAuthorityHierarchy([
            ...fiscalRows,
            ...localEntries
                .filter((e) => !isFinanceSeedEntryId(e.id))
                .map((e) => ({
                    id: e.id,
                    sourceType: 'JSON_ENTRY' as const,
                    sourceId: e.id,
                    sourceKey: `JSON_ENTRY:${e.id}`,
                    accountingDate: e.date,
                    totalCents: e.amountCents,
                    direction: 'ENTRATA' as const,
                    category: 'RICAVI_VENDITE',
                    metadataJson: null,
                })),
        ]);
        const keepLocalIds = new Set(
            combinedForLocalFilter
                .filter((r) => r.sourceType === 'JSON_ENTRY')
                .map((r) => r.id)
                .filter(Boolean) as string[]
        );

        for (const e of localEntries) {
            if (isFinanceSeedEntryId(e.id)) continue;
            if (!keepLocalIds.has(e.id)) continue;
            if (map.has(e.id)) continue;
            map.set(e.id, {
                id: e.id,
                date: e.date,
                description: e.description,
                dareAccount: e.dareAccount,
                avereAccount: e.avereAccount,
                amountCents: e.amountCents,
                netCents: Math.max(0, e.amountCents - (e.vatAmountCents || 0)),
                vatCents: e.vatAmountCents || 0,
                direction: isEntrataFromLocal(e.dareAccount, e.avereAccount) ? 'ENTRATA' : 'USCITA',
                category: 'JSON_ENTRY',
                counterpartyName: null,
                documentRef: e.invoiceReference,
                sourceType: 'JSON_ENTRY',
                sourceId: e.id,
                orderId: null,
                partnerId: null,
                bankLineId: null,
                attachmentUrl: null,
                isEntrata: isEntrataFromLocal(e.dareAccount, e.avereAccount),
                sourceLabel: fonteOverrides[e.id] || 'Manuale',
                attachments: [],
            });
        }

        let list = Array.from(map.values());
        const q = searchTerm.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (e) =>
                    e.description.toLowerCase().includes(q) ||
                    e.dareAccount.toLowerCase().includes(q) ||
                    e.avereAccount.toLowerCase().includes(q) ||
                    e.id.toLowerCase().includes(q) ||
                    (e.counterpartyName || '').toLowerCase().includes(q) ||
                    (e.documentRef || '').toLowerCase().includes(q) ||
                    (e.sourceId || '').toLowerCase().includes(q) ||
                    (e.orderId || '').toLowerCase().includes(q) ||
                    (e.partnerId || '').toLowerCase().includes(q) ||
                    (e.bankLineId || '').toLowerCase().includes(q) ||
                    (e.attachmentUrl || '').toLowerCase().includes(q) ||
                    categoryLabel(e.category).toLowerCase().includes(q) ||
                    labelSourceTypeIt(e.sourceType).toLowerCase().includes(q)
            );
        }
        list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
        return list;
    }, [localEntries, neonRows, searchTerm, fonteOverrides]);

    if (loading && rows.length === 0) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={16} />
                Caricamento scritture reali…
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="px-4 pt-3 flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                    Solo scritture reali (bonifico Fineco unico per pagamento; documenti SDI/manuali
                    allegati, non sommati) · {rows.length} voci
                </p>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600"
                >
                    <RefreshCw size={12} />
                    Aggiorna
                </button>
            </div>
            {error && (
                <div className="mx-4 text-xs bg-rose-50 border border-rose-100 text-rose-700 rounded-xl px-3 py-2">
                    {error}
                </div>
            )}
            <div className={PRIMA_NOTA_TABLE_SCROLL_CLASS}>
                <table className="border-collapse text-left text-sm table-auto w-max">
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider shadow-sm">
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Data</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">ID</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Dir.</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Categoria</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap min-w-[12rem] max-w-[16rem]">
                                Descrizione
                            </th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap min-w-[7rem] max-w-[10rem]">
                                Controparte
                            </th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Conto Dare</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Conto Avere</th>
                            <th className="px-2 py-2.5 bg-slate-50 text-right whitespace-nowrap">Impon.</th>
                            <th className="px-2 py-2.5 bg-slate-50 text-right whitespace-nowrap">IVA</th>
                            <th className="px-2 py-2.5 bg-slate-50 text-right whitespace-nowrap">Totale</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Rif. doc.</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Tipo</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Fonte</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">ID fonte</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">ID ordine</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">ID partner</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Riga Fineco</th>
                            <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap">Allegato</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={19}
                                    className="px-3 py-10 text-center text-slate-400 italic"
                                >
                                    Nessuna scrittura contabile reale. Allinea l&apos;Archivio
                                    Storico o importa fatture/gateway.
                                </td>
                            </tr>
                        ) : (
                            rows.map((entry) => {
                                const amount = formatSignedAmount(
                                    entry.amountCents,
                                    entry.isEntrata
                                );
                                return (
                                <tr key={entry.id} className="hover:bg-slate-50/60 align-top">
                                    <td className="px-2 py-2 text-[11px] text-slate-600 whitespace-nowrap">
                                        {formatFinanceDate(entry.date)}
                                    </td>
                                    <td className="px-2 py-2">
                                        <span
                                            className="inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-700 whitespace-nowrap"
                                            title={entry.id}
                                        >
                                            <FileText size={10} />
                                            {truncateCell(entry.id, 14)}
                                        </span>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        <span
                                            className={`text-[10px] font-bold uppercase ${
                                                entry.direction === 'ENTRATA'
                                                    ? 'text-emerald-700'
                                                    : 'text-rose-700'
                                            }`}
                                        >
                                            {entry.direction === 'ENTRATA' ? 'IN' : 'OUT'}
                                        </span>
                                    </td>
                                    <td
                                        className="px-2 py-2 text-[10px] text-slate-600 max-w-[9rem] whitespace-normal break-words"
                                        title={categoryLabel(entry.category)}
                                    >
                                        {categoryLabel(entry.category)}
                                    </td>
                                    <td
                                        className="px-2 py-2 font-medium text-slate-800 min-w-[12rem] max-w-[16rem] whitespace-normal break-words text-xs leading-snug"
                                        title={entry.description}
                                    >
                                        <div>{entry.description}</div>
                                        {entry.attachments.length > 0 && (
                                            <div className="mt-1 flex flex-wrap gap-0.5">
                                                {entry.attachments.map((att) => (
                                                    <span
                                                        key={`${att.kind}-${att.label}-${att.entryId || ''}`}
                                                        className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-600"
                                                        title={att.label}
                                                    >
                                                        {attachmentBadgeEmoji(att.kind)} {att.label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td
                                        className="px-2 py-2 text-[10px] text-slate-600 min-w-[7rem] max-w-[10rem] whitespace-normal break-words"
                                        title={entry.counterpartyName || undefined}
                                    >
                                        {entry.counterpartyName || '—'}
                                    </td>
                                    <td
                                        className="px-2 py-2 text-[10px] font-mono text-slate-600 whitespace-nowrap"
                                        title={entry.dareAccount}
                                    >
                                        {entry.dareAccount}
                                    </td>
                                    <td
                                        className="px-2 py-2 text-[10px] font-mono text-slate-600 whitespace-nowrap"
                                        title={entry.avereAccount}
                                    >
                                        {entry.avereAccount}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-[11px] text-right whitespace-nowrap text-slate-700">
                                        € {euro(entry.netCents)}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-[11px] text-right whitespace-nowrap text-slate-500">
                                        € {euro(entry.vatCents)}
                                    </td>
                                    <td
                                        className={`px-2 py-2 font-bold font-mono text-[11px] text-right whitespace-nowrap ${amount.className}`}
                                    >
                                        {amount.text}
                                    </td>
                                    <td
                                        className="px-2 py-2 text-[10px] text-slate-600 whitespace-nowrap"
                                        title={entry.documentRef || undefined}
                                    >
                                        {truncateCell(entry.documentRef, 16)}
                                    </td>
                                    <td
                                        className="px-2 py-2 text-[10px] text-slate-600 whitespace-nowrap"
                                        title={labelSourceTypeIt(entry.sourceType)}
                                    >
                                        {truncateCell(labelSourceTypeIt(entry.sourceType), 18)}
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        {editingFonteId === entry.id ? (
                                            <select
                                                autoFocus
                                                className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700"
                                                value={entry.sourceLabel}
                                                onChange={(e) =>
                                                    void saveFonte(entry.id, e.target.value)
                                                }
                                                onBlur={() => setEditingFonteId(null)}
                                            >
                                                {FONTE_OPTIONS.map((f) => (
                                                    <option key={f} value={f}>
                                                        {f}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setEditingFonteId(entry.id)}
                                                className="inline-flex px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-600"
                                                title="Modifica fonte"
                                            >
                                                {entry.sourceLabel}
                                            </button>
                                        )}
                                    </td>
                                    <td
                                        className="px-2 py-2 font-mono text-[10px] text-slate-600 whitespace-nowrap"
                                        title={entry.sourceId || undefined}
                                    >
                                        {truncateCell(entry.sourceId, 14)}
                                    </td>
                                    <td
                                        className="px-2 py-2 font-mono text-[10px] text-slate-600 whitespace-nowrap"
                                        title={entry.orderId || undefined}
                                    >
                                        {truncateCell(entry.orderId, 14)}
                                    </td>
                                    <td
                                        className="px-2 py-2 font-mono text-[10px] text-slate-600 whitespace-nowrap"
                                        title={entry.partnerId || undefined}
                                    >
                                        {truncateCell(entry.partnerId, 14)}
                                    </td>
                                    <td
                                        className="px-2 py-2 font-mono text-[10px] text-slate-600 whitespace-nowrap"
                                        title={entry.bankLineId || undefined}
                                    >
                                        {truncateCell(entry.bankLineId, 14)}
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        {entry.attachmentUrl ? (
                                            <a
                                                href={entry.attachmentUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 hover:text-blue-900"
                                                title={entry.attachmentUrl}
                                            >
                                                <ExternalLink size={10} />
                                                Apri
                                            </a>
                                        ) : (
                                            <span className="text-[10px] text-slate-400">—</span>
                                        )}
                                    </td>
                                </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
