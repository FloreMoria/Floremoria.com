'use client';

/**
 * Scritture di Prima Nota — vista essenziale + drawer dettaglio.
 * Gerarchia fiscale + dedup visiva su data/importo/controparte/riferimento.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { formatFinanceDate, isFinanceSeedEntryId } from '@/lib/financial/formatFinanceDate';
import { labelSourceTypeIt } from '@/lib/financial/fiscalItalianLabels';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import type { ConsolidatedFiscalAttachment } from '@/lib/financial/fiscalAuthorityDedupe';
import type { AccountingEntry } from '@/lib/financial/types';
import {
    categoryLabel,
    compactCausalePreview,
    currentPrimaNotaPeriodKey,
    dedupePrimaNotaVisualEntries,
    formatEuroBalance,
    gatewayBadge,
    periodBounds,
    PRIMA_NOTA_PERIOD_OPTIONS,
    reconciliationStatusLabel,
    RECONCILIATION_STATUS_OPTIONS,
    signedMovementCents,
    type PrimaNotaDisplayEntry,
    type PrimaNotaPeriodKey,
} from '@/lib/financial/primaNotaShared';
import PrimaNotaDetailDrawer from '@/components/dashboard/PrimaNotaDetailDrawer';

const STORAGE_KEY = 'floremoria.primaNota.period';
const FISCAL_YEAR = 2026;

const PRIMA_NOTA_TABLE_SCROLL_CLASS =
    'dashboard-table-scroll max-h-[min(70vh,calc(2.75rem+28*2.85rem))] overflow-y-auto overflow-x-auto [scrollbar-width:thin]';

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
    vatRate?: number;
    category: string;
    direction: string;
    reconciliationStatus?: string;
    metadataJson?: {
        dareAccount?: string;
        avereAccount?: string;
        stripeTransactionId?: string;
        displayFonte?: string;
        [key: string]: unknown;
    } | null;
};

function readStoredPeriod(): PrimaNotaPeriodKey {
    if (typeof window === 'undefined') return currentPrimaNotaPeriodKey();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === 'Q1' || raw === 'Q2' || raw === 'Q3' || raw === 'Q4' || raw === 'YEAR') {
            return raw;
        }
        const dossierQ = window.localStorage.getItem('floremoria.dossier.quarter');
        if (dossierQ === '1' || dossierQ === '2' || dossierQ === '3' || dossierQ === '4') {
            return `Q${dossierQ}` as PrimaNotaPeriodKey;
        }
    } catch {
        /* ignore */
    }
    return currentPrimaNotaPeriodKey();
}

function isEntrataFromNeon(r: NeonRow): boolean {
    if (r.direction === 'ENTRATA') return true;
    if (r.direction === 'USCITA') return false;
    return r.totalCents > 0;
}

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

function buildDisplayEntry(
    partial: Omit<PrimaNotaDisplayEntry, never>
): PrimaNotaDisplayEntry {
    return partial;
}

type Props = {
    localEntries: AccountingEntry[];
    searchTerm?: string;
};

export default function PrimaNotaTable({ localEntries, searchTerm = '' }: Props) {
    const [neonRows, setNeonRows] = useState<NeonRow[]>([]);
    const [fonteOverrides, setFonteOverrides] = useState<Record<string, string>>({});
    const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<PrimaNotaDisplayEntry | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
    const [periodKey, setPeriodKey] = useState<PrimaNotaPeriodKey>(() => currentPrimaNotaPeriodKey());

    useEffect(() => {
        setPeriodKey(readStoredPeriod());
    }, []);

    const setPeriod = (key: PrimaNotaPeriodKey) => {
        setPeriodKey(key);
        try {
            window.localStorage.setItem(STORAGE_KEY, key);
            if (key.startsWith('Q')) {
                window.localStorage.setItem('floremoria.dossier.quarter', key.slice(1));
            }
        } catch {
            /* ignore */
        }
    };

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

    const saveStatus = async (entryId: string, reconciliationStatus: string) => {
        setSavingStatusId(entryId);
        try {
            const res = await fetch('/api/dashboard/finance/historical-ledger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_reconciliation_status',
                    entryId,
                    reconciliationStatus,
                }),
            });
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Salvataggio stato fallito');
            setStatusOverrides((prev) => ({ ...prev, [entryId]: reconciliationStatus }));
            setNeonRows((prev) =>
                prev.map((r) =>
                    r.id === entryId ? { ...r, reconciliationStatus } : r
                )
            );
            setSelectedEntry((prev) =>
                prev?.id === entryId ? { ...prev, reconciliationStatus } : prev
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore salvataggio stato');
        } finally {
            setSavingStatusId(null);
        }
    };

    const rows: PrimaNotaDisplayEntry[] = useMemo(() => {
        const cleanedNeon = neonRows.filter((r) => {
            if (r.sourceType === 'CUSTOMER_RECEIPT') return false;
            if (r.sourceType === 'JSON_ENTRY' && isFinanceSeedEntryId(r.sourceId || '')) return false;
            return true;
        });

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

        const map = new Map<string, PrimaNotaDisplayEntry>();

        for (const r of cleanedNeon) {
            if (!keepNeonIds.has(r.id)) continue;
            const enriched = fiscalById.get(r.id);
            const meta = (enriched?.metadataJson || r.metadataJson || {}) as Record<string, unknown>;
            const attachments = Array.isArray(meta.consolidatedAttachments)
                ? (meta.consolidatedAttachments as ConsolidatedFiscalAttachment[])
                : [];
            const accounts = accountsFromNeon(r);
            const reconciliationStatus =
                statusOverrides[r.id] || r.reconciliationStatus || 'UNMATCHED';

            map.set(
                r.id,
                buildDisplayEntry({
                    id: r.id,
                    date: String(r.accountingDate).slice(0, 10),
                    description: r.description,
                    dareAccount: accounts.dare,
                    avereAccount: accounts.avere,
                    amountCents: Math.abs(r.totalCents || r.netCents || 0),
                    netCents: Math.abs(r.netCents || r.totalCents || 0),
                    vatCents: Math.abs(r.vatCents || 0),
                    vatRate: Number(r.vatRate || 0),
                    direction: r.direction || (r.totalCents >= 0 ? 'ENTRATA' : 'USCITA'),
                    category: r.category || '—',
                    counterpartyName: r.counterpartyName || null,
                    documentRef: r.documentRef || null,
                    sourceType: r.sourceType,
                    sourceId: r.sourceId || null,
                    sourceKey: r.sourceKey || null,
                    orderId: r.orderId || null,
                    partnerId: r.partnerId || null,
                    bankLineId: r.bankLineId || null,
                    attachmentUrl: r.attachmentUrl || null,
                    reconciliationStatus,
                    isEntrata: isEntrataFromNeon(r),
                    sourceLabel: sourceLabel(
                        r.sourceType,
                        fonteOverrides[r.id] ||
                            (typeof meta.displayFonte === 'string' ? meta.displayFonte : null)
                    ),
                    attachments,
                })
            );
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
            const isEntrata = isEntrataFromLocal(e.dareAccount, e.avereAccount);
            map.set(
                e.id,
                buildDisplayEntry({
                    id: e.id,
                    date: e.date,
                    description: e.description,
                    dareAccount: e.dareAccount,
                    avereAccount: e.avereAccount,
                    amountCents: e.amountCents,
                    netCents: Math.max(0, e.amountCents - (e.vatAmountCents || 0)),
                    vatCents: e.vatAmountCents || 0,
                    vatRate: e.vatAmountCents
                        ? Math.round((e.vatAmountCents / Math.max(1, e.amountCents - e.vatAmountCents)) * 100)
                        : 0,
                    direction: isEntrata ? 'ENTRATA' : 'USCITA',
                    category: 'JSON_ENTRY',
                    counterpartyName: null,
                    documentRef: e.invoiceReference,
                    sourceType: 'JSON_ENTRY',
                    sourceId: e.id,
                    sourceKey: `JSON_ENTRY:${e.id}`,
                    orderId: null,
                    partnerId: null,
                    bankLineId: null,
                    attachmentUrl: null,
                    reconciliationStatus: statusOverrides[e.id] || 'UNMATCHED',
                    isEntrata,
                    sourceLabel: fonteOverrides[e.id] || 'Manuale',
                    attachments: [],
                })
            );
        }

        let list = dedupePrimaNotaVisualEntries(Array.from(map.values()));
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
                    categoryLabel(e.category).toLowerCase().includes(q) ||
                    labelSourceTypeIt(e.sourceType).toLowerCase().includes(q) ||
                    e.sourceLabel.toLowerCase().includes(q) ||
                    reconciliationStatusLabel(e.reconciliationStatus).toLowerCase().includes(q)
            );
        }
        // Cronologico crescente per saldo progressivo
        list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        return list;
    }, [localEntries, neonRows, searchTerm, fonteOverrides, statusOverrides]);

    const bounds = useMemo(
        () => periodBounds(FISCAL_YEAR, periodKey),
        [periodKey]
    );

    const { periodRows, openingBalanceCents, closingBalanceCents } = useMemo(() => {
        const before = rows.filter((e) => e.date < bounds.start);
        const inPeriod = rows.filter((e) => e.date >= bounds.start && e.date <= bounds.end);
        const opening = before.reduce((s, e) => s + signedMovementCents(e), 0);
        const periodNet = inPeriod.reduce((s, e) => s + signedMovementCents(e), 0);
        return {
            periodRows: inPeriod,
            openingBalanceCents: opening,
            closingBalanceCents: opening + periodNet,
        };
    }, [rows, bounds.start, bounds.end]);

    const rowsWithRunning = useMemo(() => {
        let running = openingBalanceCents;
        return periodRows.map((entry) => {
            running += signedMovementCents(entry);
            return { entry, runningCents: running };
        });
    }, [periodRows, openingBalanceCents]);

    const openDrawer = (entry: PrimaNotaDisplayEntry) => {
        setSelectedEntry(entry);
        setDrawerOpen(true);
    };

    if (loading && rows.length === 0) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={16} />
                Caricamento scritture reali…
            </div>
        );
    }

    const periodOptions = PRIMA_NOTA_PERIOD_OPTIONS.map((o) => ({
        ...o,
        label: o.label.replace(/2026/g, String(FISCAL_YEAR)),
    }));

    return (
        <>
            <div className="space-y-3">
                <div className="px-4 pt-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div
                            className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-0.5 gap-0.5"
                            role="tablist"
                            aria-label="Filtro periodo Prima Nota"
                        >
                            {periodOptions.map((opt) => {
                                const active = periodKey === opt.key;
                                return (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => setPeriod(opt.key)}
                                        title={opt.label}
                                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                                            active
                                                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        {opt.key === 'YEAR' ? (
                                            <>Anno {FISCAL_YEAR}</>
                                        ) : (
                                            <>
                                                {opt.key}{' '}
                                                <span className="hidden md:inline font-normal text-slate-500">
                                                    {opt.key === 'Q1'
                                                        ? '(Gen–Mar)'
                                                        : opt.key === 'Q2'
                                                          ? '(Apr–Giu)'
                                                          : opt.key === 'Q3'
                                                            ? '(Lug–Set)'
                                                            : '(Ott–Dic)'}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600"
                        >
                            <RefreshCw size={12} />
                            Aggiorna
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Periodo
                            </p>
                            <p className="text-sm font-semibold text-slate-800">{bounds.label}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Saldo iniziale
                            </p>
                            <p
                                className={`text-sm font-bold font-mono ${
                                    openingBalanceCents >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                            >
                                {formatEuroBalance(openingBalanceCents)}
                            </p>
                            <p className="text-[10px] text-slate-400">Riporto da prima del periodo</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Saldo finale
                            </p>
                            <p
                                className={`text-sm font-bold font-mono ${
                                    closingBalanceCents >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                            >
                                {formatEuroBalance(closingBalanceCents)}
                            </p>
                            <p className="text-[10px] text-slate-400">
                                {periodRows.length} movimenti nel periodo
                            </p>
                        </div>
                    </div>

                    <p className="text-[11px] text-slate-500">
                        Clicca una riga per il dettaglio · causale compatta (hover = testo completo) ·{' '}
                        {periodRows.length} voci
                    </p>
                </div>
                {error && (
                    <div className="mx-4 text-xs bg-rose-50 border border-rose-100 text-rose-700 rounded-xl px-3 py-2">
                        {error}
                    </div>
                )}
                <div className={PRIMA_NOTA_TABLE_SCROLL_CLASS}>
                    <table className="border-collapse text-left text-sm w-full table-fixed">
                        <thead className="sticky top-0 z-10">
                            <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider shadow-sm">
                                <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap w-[5.5rem]">
                                    Data
                                </th>
                                <th className="px-2 py-2.5 bg-slate-50 w-[14rem] max-w-[14rem]">
                                    Causale
                                </th>
                                <th className="px-2 py-2.5 bg-slate-50 text-right whitespace-nowrap w-[6.5rem]">
                                    Entrata
                                </th>
                                <th className="px-2 py-2.5 bg-slate-50 text-right whitespace-nowrap w-[6.5rem]">
                                    Uscita
                                </th>
                                <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap w-[5.5rem]">
                                    Conto
                                </th>
                                <th className="px-2 py-2.5 bg-slate-50 text-right whitespace-nowrap w-[7rem]">
                                    Saldo
                                </th>
                                <th className="px-2 py-2.5 bg-slate-50 whitespace-nowrap w-[8.5rem]">
                                    Stato
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rowsWithRunning.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-3 py-10 text-center text-slate-400 italic"
                                    >
                                        Nessun movimento nel periodo selezionato.
                                    </td>
                                </tr>
                            ) : (
                                rowsWithRunning.map(({ entry, runningCents }) => {
                                    const preview = compactCausalePreview(
                                        entry.description,
                                        entry.counterpartyName
                                    );
                                    const badge = gatewayBadge(entry);
                                    const isSelected = selectedEntry?.id === entry.id && drawerOpen;
                                    const entrata = entry.isEntrata
                                        ? formatEuroBalance(entry.amountCents)
                                        : '';
                                    const uscita = !entry.isEntrata
                                        ? formatEuroBalance(entry.amountCents)
                                        : '';
                                    return (
                                        <tr
                                            key={entry.id}
                                            onClick={() => openDrawer(entry)}
                                            className={`cursor-pointer transition-colors align-top ${
                                                isSelected
                                                    ? 'bg-blue-50/80 hover:bg-blue-50'
                                                    : 'hover:bg-slate-50/80'
                                            }`}
                                        >
                                            <td className="px-2 py-2 text-xs text-slate-600 whitespace-nowrap">
                                                {formatFinanceDate(entry.date)}
                                            </td>
                                            <td
                                                className="px-2 py-2 max-w-[14rem] w-56"
                                                title={entry.description}
                                            >
                                                <div className="max-w-[220px] overflow-hidden">
                                                    <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">
                                                        {preview.title}
                                                        {preview.subtitle ? (
                                                            <span className="font-normal text-slate-500">
                                                                {' '}
                                                                · {preview.subtitle}
                                                            </span>
                                                        ) : null}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-2 py-2 text-right font-mono text-xs font-bold text-emerald-700 whitespace-nowrap">
                                                {entrata || (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 text-right font-mono text-xs font-bold text-rose-700 whitespace-nowrap">
                                                {uscita || (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 whitespace-nowrap">
                                                <span
                                                    className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                                                >
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td
                                                className={`px-2 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap ${
                                                    runningCents >= 0
                                                        ? 'text-slate-800'
                                                        : 'text-rose-700'
                                                }`}
                                            >
                                                {formatEuroBalance(runningCents)}
                                            </td>
                                            <td
                                                className="px-2 py-2 whitespace-nowrap"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <select
                                                    disabled={savingStatusId === entry.id}
                                                    value={entry.reconciliationStatus}
                                                    onChange={(e) =>
                                                        void saveStatus(entry.id, e.target.value)
                                                    }
                                                    className="w-full max-w-[8.5rem] rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-700"
                                                    title="Modifica stato riconciliazione"
                                                >
                                                    {RECONCILIATION_STATUS_OPTIONS.map((s) => (
                                                        <option key={s} value={s}>
                                                            {reconciliationStatusLabel(s)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <PrimaNotaDetailDrawer
                entry={selectedEntry}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onFonteSaved={(entryId, fonteLabel) => {
                    setFonteOverrides((prev) => ({ ...prev, [entryId]: fonteLabel }));
                    setSelectedEntry((prev) =>
                        prev?.id === entryId ? { ...prev, sourceLabel: fonteLabel } : prev
                    );
                }}
                onStatusSaved={(entryId, status) => {
                    setStatusOverrides((prev) => ({ ...prev, [entryId]: status }));
                    setSelectedEntry((prev) =>
                        prev?.id === entryId ? { ...prev, reconciliationStatus: status } : prev
                    );
                }}
            />
        </>
    );
}
