'use client';

/**
 * Pannello riconciliazione manuale unificata — due colonne, conferma esplicita,
 * tastiera (↑↓ Invio Esc). Ogni conferma è una scrittura immediata (niente batch).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Check, Loader2, RefreshCw, Search, Undo2, X } from 'lucide-react';
import { bankCategoriesForAmount } from '@/lib/financial/bankCategoryOptions';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type PendingLine = {
    lineId: string;
    documentId: string;
    documentFileName: string;
    accountingDate: string | null;
    valueDate: string | null;
    description: string;
    amountCents: number;
    matchStatus: string;
};

type MatchSuggestion = {
    kind: string;
    label: string;
    score: number;
    matchType: string;
    matchedTxId?: string | null;
    matchedOrderId?: string | null;
    expenseId?: string | null;
    notes: string;
};

type RecentItem = {
    lineId: string;
    documentId: string;
    documentFileName: string;
    accountingDate: string | null;
    description: string;
    amountCents: number;
    matchType: string | null;
    matchNotes: string | null;
    updatedAt: string;
};

type OrderHit = {
    id: string;
    orderNumber: string | null;
    deceasedName: string | null;
    cemeteryCity: string | null;
};

type DocHit = {
    id: string;
    expenseDate: string;
    docType: string;
    vendorName: string;
    description: string;
    totalCents: number;
    fileName: string | null;
    reconciled: boolean;
    matchedStatementLineId: string | null;
    invoiceNumber: string | null;
    ingestChannel: string | null;
    suggestedMatchType: string;
    fileUrl: string | null;
};

type Summary = {
    unmatchedCount: number;
    inflowCents: number;
    outflowCents: number;
    oldestAccountingDate: string | null;
    documentCount: number;
};

function formatEuro(cents: number): string {
    const sign = cents < 0 ? '−' : cents > 0 ? '+' : '';
    return `${sign}${(Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} €`;
}

function formatDay(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (!y || !m || !d) return iso.slice(0, 10);
    return `${d}/${m}/${y}`;
}

type Props = {
    /** Notifica il parent del contatore scoperte (badge tab). */
    onCountChange?: (count: number) => void;
};

export default function ManualReconciliationPanel({ onCountChange }: Props) {
    const year = new Date().getFullYear();
    const [lines, setLines] = useState<PendingLine[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [recent, setRecent] = useState<RecentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sign, setSign] = useState<'all' | 'in' | 'out'>('all');
    const [sort, setSort] = useState<'date' | 'amount'>('amount');
    const [q, setQ] = useState('');
    const [qDebounced, setQDebounced] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [category, setCategory] = useState('UNDOCUMENTED_EXPENSE');
    const [notes, setNotes] = useState('');
    const [orderQ, setOrderQ] = useState('');
    const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [docQ, setDocQ] = useState('');
    const [docHits, setDocHits] = useState<DocHit[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<DocHit | null>(null);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const prefetchCache = useRef<Map<string, MatchSuggestion[]>>(new Map());

    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 250);
        return () => clearTimeout(t);
    }, [q]);

    const loadQueue = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                year: String(year),
                sort,
                sign,
                limit: '200',
                includeRecent: '1',
            });
            if (qDebounced) params.set('q', qDebounced);
            const res = await fetch(
                `/api/dashboard/finance/reconciliation/pending?${params.toString()}`,
                { cache: 'no-store' }
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                lines?: PendingLine[];
                summary?: Summary;
                recent?: RecentItem[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Caricamento fallito');
            const nextLines = parsed.data?.lines || [];
            setLines(nextLines);
            setSummary(parsed.data?.summary || null);
            setRecent(parsed.data?.recent || []);
            onCountChange?.(parsed.data?.summary?.unmatchedCount ?? nextLines.length);
            setSelectedId((prev) => {
                if (prev && nextLines.some((l) => l.lineId === prev)) return prev;
                return nextLines[0]?.lineId ?? null;
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Caricamento fallito');
        } finally {
            setLoading(false);
        }
    }, [year, sort, sign, qDebounced, onCountChange]);

    useEffect(() => {
        void loadQueue();
    }, [loadQueue]);

    const selected = useMemo(
        () => lines.find((l) => l.lineId === selectedId) || null,
        [lines, selectedId]
    );

    const selectedIndex = useMemo(
        () => lines.findIndex((l) => l.lineId === selectedId),
        [lines, selectedId]
    );

    const loadSuggestions = useCallback(
        async (line: PendingLine, opts?: { prefetchNext?: boolean }) => {
            const cacheKey = line.lineId;
            const cached = prefetchCache.current.get(cacheKey);
            if (cached) {
                setSuggestions(cached);
                setLoadingSuggestions(false);
            } else {
                setLoadingSuggestions(true);
                setSuggestions([]);
            }
            try {
                const res = await fetch(
                    `/api/dashboard/finance/bank-statements/${line.documentId}/lines/${line.lineId}/suggestions`
                );
                const parsed = await readJsonResponse<{
                    ok?: boolean;
                    suggestions?: MatchSuggestion[];
                    error?: string;
                }>(res);
                const list = parsed.data?.suggestions || [];
                prefetchCache.current.set(cacheKey, list);
                if (selectedId === line.lineId || !selectedId) {
                    setSuggestions(list);
                }
            } catch {
                if (selectedId === line.lineId) setSuggestions([]);
            } finally {
                setLoadingSuggestions(false);
            }

            if (opts?.prefetchNext) {
                const idx = lines.findIndex((l) => l.lineId === line.lineId);
                const next = lines[idx + 1];
                if (next && !prefetchCache.current.has(next.lineId)) {
                    void fetch(
                        `/api/dashboard/finance/bank-statements/${next.documentId}/lines/${next.lineId}/suggestions`
                    )
                        .then((r) => r.json())
                        .then((data: { suggestions?: MatchSuggestion[] }) => {
                            prefetchCache.current.set(next.lineId, data.suggestions || []);
                        })
                        .catch(() => undefined);
                }
            }
        },
        [lines, selectedId]
    );

    useEffect(() => {
        if (!selected) {
            setSuggestions([]);
            return;
        }
        setCategory(
            selected.amountCents >= 0
                ? 'OTHER_REVENUE'
                : 'UNDOCUMENTED_EXPENSE'
        );
        setNotes('');
        setSelectedOrderId(null);
        setOrderQ('');
        setOrderHits([]);
        setSelectedDoc(null);
        setDocQ('');
        setDocHits([]);
        void loadSuggestions(selected, { prefetchNext: true });
    }, [selected?.lineId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!orderQ.trim() || orderQ.trim().length < 2) {
            setOrderHits([]);
            return;
        }
        const t = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/dashboard/orders/search?q=${encodeURIComponent(orderQ.trim())}&limit=12`
                );
                const data = (await res.json()) as { orders?: OrderHit[] };
                setOrderHits(data.orders || []);
            } catch {
                setOrderHits([]);
            }
        }, 280);
        return () => clearTimeout(t);
    }, [orderQ]);

    useEffect(() => {
        if (!selected || selected.amountCents >= 0) {
            setDocHits([]);
            return;
        }
        const t = setTimeout(async () => {
            setLoadingDocs(true);
            try {
                const params = new URLSearchParams({
                    search: '1',
                    amountCents: String(selected.amountCents),
                    limit: '20',
                });
                if (docQ.trim()) params.set('q', docQ.trim());
                const res = await fetch(
                    `/api/dashboard/finance/manual-expenses?${params.toString()}`,
                    { cache: 'no-store' }
                );
                const data = (await res.json()) as { ok?: boolean; expenses?: DocHit[] };
                setDocHits(data.expenses || []);
            } catch {
                setDocHits([]);
            } finally {
                setLoadingDocs(false);
            }
        }, docQ.trim() ? 280 : 80);
        return () => clearTimeout(t);
    }, [selected?.lineId, selected?.amountCents, docQ]);

    const selectByIndex = useCallback(
        (idx: number) => {
            if (idx < 0 || idx >= lines.length) return;
            setSelectedId(lines[idx].lineId);
            const el = listRef.current?.querySelector(`[data-line-id="${lines[idx].lineId}"]`);
            el?.scrollIntoView({ block: 'nearest' });
        },
        [lines]
    );

    const applyMatch = useCallback(
        async (payload: {
            matchType: string;
            matchNotes: string;
            matchedOrderId?: string | null;
            matchedTxId?: string | null;
            expenseId?: string | null;
        }) => {
            if (!selected) return;
            setSaving(true);
            setStatusMsg(null);
            try {
                const res = await fetch(
                    `/api/dashboard/finance/bank-statements/${selected.documentId}/lines/${selected.lineId}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            matchType: payload.matchType,
                            matchNotes: payload.matchNotes,
                            matchedOrderId: payload.matchedOrderId || null,
                            matchedTxId: payload.matchedTxId || null,
                            expenseId: payload.expenseId || null,
                            asMatched: true,
                        }),
                    }
                );
                const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
                if (!parsed.ok) throw new Error(parsed.error || 'Abbinamento fallito');

                const removedId = selected.lineId;
                prefetchCache.current.delete(removedId);
                const nextLines = lines.filter((l) => l.lineId !== removedId);
                const nextIdx = Math.min(
                    selectedIndex >= 0 ? selectedIndex : 0,
                    Math.max(0, nextLines.length - 1)
                );
                setLines(nextLines);
                setSummary((prev) =>
                    prev
                        ? {
                              ...prev,
                              unmatchedCount: Math.max(0, prev.unmatchedCount - 1),
                              documentCount: prev.documentCount,
                          }
                        : prev
                );
                onCountChange?.(Math.max(0, (summary?.unmatchedCount ?? lines.length) - 1));
                setSelectedId(nextLines[nextIdx]?.lineId ?? null);
                setStatusMsg('Riga riconciliata.');
                // Aggiorna recenti in background
                void loadQueue();
            } catch (e) {
                setStatusMsg(e instanceof Error ? e.message : 'Abbinamento fallito');
            } finally {
                setSaving(false);
            }
        },
        [selected, lines, selectedIndex, summary, onCountChange, loadQueue]
    );

    const confirmFirstSuggestion = useCallback(() => {
        const first = suggestions[0];
        if (!first || saving) return;
        void applyMatch({
            matchType: first.matchType,
            matchNotes: first.notes || first.label,
            matchedOrderId: first.matchedOrderId,
            matchedTxId: first.matchedTxId,
            expenseId: first.expenseId,
        });
    }, [suggestions, saving, applyMatch]);

    const confirmCategoryOrOrder = useCallback(() => {
        if (!selected || saving) return;
        if (selectedDoc) {
            void applyMatch({
                matchType: selectedDoc.suggestedMatchType || 'SDI_INVOICE',
                matchNotes:
                    notes ||
                    `Documento sistema: ${selectedDoc.vendorName}${
                        selectedDoc.invoiceNumber ? ` · n. ${selectedDoc.invoiceNumber}` : ''
                    }${selectedDoc.ingestChannel ? ` · ${selectedDoc.ingestChannel}` : ''}`,
                expenseId: selectedDoc.id,
                matchedTxId: selectedDoc.id,
                matchedOrderId: selectedOrderId,
            });
            return;
        }
        const cats = bankCategoriesForAmount(selected.amountCents);
        const safe = cats.some((c) => c.matchType === category)
            ? category
            : cats[0]?.matchType || category;
        void applyMatch({
            matchType: selectedOrderId
                ? selected.amountCents < 0
                    ? 'FLORIST_INVOICE'
                    : 'OTHER_REVENUE'
                : safe,
            matchNotes: notes || (selectedOrderId ? 'Abbinato a ordine' : 'Categoria manuale'),
            matchedOrderId: selectedOrderId,
        });
    }, [selected, saving, category, notes, selectedOrderId, selectedDoc, applyMatch]);

    const unmatchRecent = useCallback(
        async (item: RecentItem) => {
            setSaving(true);
            setStatusMsg(null);
            try {
                const res = await fetch(
                    `/api/dashboard/finance/bank-statements/${item.documentId}/lines/${item.lineId}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ unmatch: true }),
                    }
                );
                const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
                if (!parsed.ok) throw new Error(parsed.error || 'Annullamento fallito');
                setStatusMsg('Abbinamento annullato — riga tornata in coda.');
                await loadQueue();
            } catch (e) {
                setStatusMsg(e instanceof Error ? e.message : 'Annullamento fallito');
            } finally {
                setSaving(false);
            }
        },
        [loadQueue]
    );

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                if (e.key === 'Escape') {
                    (e.target as HTMLElement).blur();
                    e.preventDefault();
                }
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectByIndex(selectedIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectByIndex(selectedIndex - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                confirmFirstSuggestion();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                selectByIndex(selectedIndex + 1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedIndex, selectByIndex, confirmFirstSuggestion]);

    const categoryOptions = selected
        ? bankCategoriesForAmount(selected.amountCents)
        : [];

    return (
        <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">
                        Da riconciliare
                        {summary ? (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                {summary.unmatchedCount}
                            </span>
                        ) : null}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Conferma esplicita per ogni riga · ↑↓ scorri · Invio primo suggerimento ·
                        Esc salta · anno {year}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void loadQueue()}
                    disabled={loading || saving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-50"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Aggiorna
                </button>
            </div>

            {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="text-slate-500">Scoperte</div>
                        <div className="font-bold text-slate-900">{summary.unmatchedCount}</div>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                        <div className="text-emerald-700">Entrate aperte</div>
                        <div className="font-bold text-emerald-900">
                            {formatEuro(summary.inflowCents)}
                        </div>
                    </div>
                    <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2">
                        <div className="text-rose-700">Uscite aperte</div>
                        <div className="font-bold text-rose-900">
                            {formatEuro(summary.outflowCents)}
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="text-slate-500">Più vecchia</div>
                        <div className="font-bold text-slate-900">
                            {formatDay(summary.oldestAccountingDate)}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[180px]">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Filtra descrizione o documento…"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400"
                    />
                </div>
                <select
                    value={sign}
                    onChange={(e) => setSign(e.target.value as 'all' | 'in' | 'out')}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                >
                    <option value="all">Tutti i segni</option>
                    <option value="in">Solo entrate</option>
                    <option value="out">Solo uscite</option>
                </select>
                <button
                    type="button"
                    onClick={() => setSort((s) => (s === 'date' ? 'amount' : 'date'))}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                    title="Alterna ordinamento data / importo"
                >
                    <ArrowDownUp size={14} />
                    {sort === 'amount' ? 'Importo ↓' : 'Data ↓'}
                </button>
            </div>

            {error && (
                <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    {error}
                </p>
            )}
            {statusMsg && (
                <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                    {statusMsg}
                </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[520px]">
                {/* Sinistra — coda */}
                <div
                    ref={listRef}
                    className="border border-slate-200 rounded-2xl overflow-hidden flex flex-col max-h-[640px]"
                >
                    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Movimenti da sistemare
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {loading && lines.length === 0 ? (
                            <div className="p-8 flex justify-center text-slate-400">
                                <Loader2 className="animate-spin" size={22} />
                            </div>
                        ) : lines.length === 0 ? (
                            <p className="p-6 text-sm text-slate-500 text-center">
                                Nessuna riga da riconciliare con i filtri attuali.
                            </p>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {lines.map((line) => {
                                    const active = line.lineId === selectedId;
                                    const positive = line.amountCents >= 0;
                                    return (
                                        <li key={line.lineId}>
                                            <button
                                                type="button"
                                                data-line-id={line.lineId}
                                                onClick={() => setSelectedId(line.lineId)}
                                                className={`w-full text-left px-3 py-2.5 transition-colors ${
                                                    active
                                                        ? 'bg-amber-50 border-l-4 border-amber-400'
                                                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-[11px] text-slate-500">
                                                            {formatDay(
                                                                line.accountingDate ||
                                                                    line.valueDate
                                                            )}{' '}
                                                            ·{' '}
                                                            <span className="truncate">
                                                                {line.documentFileName}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-slate-800 line-clamp-2 mt-0.5">
                                                            {line.description}
                                                        </div>
                                                    </div>
                                                    <div
                                                        className={`shrink-0 text-sm font-bold tabular-nums ${
                                                            positive
                                                                ? 'text-emerald-700'
                                                                : 'text-rose-700'
                                                        }`}
                                                    >
                                                        {formatEuro(line.amountCents)}
                                                    </div>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Destra — decisione */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden flex flex-col max-h-[640px]">
                    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Decisione sulla riga
                    </div>
                    <div className="overflow-y-auto flex-1 p-4 space-y-4">
                        {!selected ? (
                            <p className="text-sm text-slate-500">
                                Seleziona un movimento a sinistra.
                            </p>
                        ) : (
                            <>
                                <div>
                                    <div className="text-[11px] text-slate-500">
                                        {formatDay(
                                            selected.accountingDate || selected.valueDate
                                        )}{' '}
                                        · {selected.documentFileName}
                                    </div>
                                    <p className="text-sm text-slate-900 mt-1">
                                        {selected.description}
                                    </p>
                                    <p
                                        className={`text-lg font-bold mt-2 tabular-nums ${
                                            selected.amountCents >= 0
                                                ? 'text-emerald-700'
                                                : 'text-rose-700'
                                        }`}
                                    >
                                        {formatEuro(selected.amountCents)}
                                    </p>
                                </div>

                                <div>
                                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">
                                        Suggerimenti
                                    </h4>
                                    {loadingSuggestions ? (
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <Loader2 size={14} className="animate-spin" />
                                            Caricamento…
                                        </div>
                                    ) : suggestions.length === 0 ? (
                                        <p className="text-sm text-slate-500">
                                            Nessun suggerimento automatico — usa categoria o
                                            ricerca ordine.
                                        </p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {suggestions.map((s, i) => (
                                                <li key={`${s.matchType}-${i}`}>
                                                    <button
                                                        type="button"
                                                        disabled={saving}
                                                        onClick={() =>
                                                            void applyMatch({
                                                                matchType: s.matchType,
                                                                matchNotes:
                                                                    s.notes || s.label,
                                                                matchedOrderId:
                                                                    s.matchedOrderId,
                                                                matchedTxId: s.matchedTxId,
                                                                expenseId: s.expenseId,
                                                            })
                                                        }
                                                        className="w-full text-left rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 px-3 py-2 disabled:opacity-50"
                                                    >
                                                        <div className="flex justify-between gap-2">
                                                            <span className="text-sm font-semibold text-slate-800">
                                                                {s.label}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-slate-500">
                                                                {s.score}
                                                            </span>
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 mt-0.5">
                                                            {s.notes} · {s.matchType}
                                                            {i === 0 ? ' · Invio' : ''}
                                                        </div>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="space-y-2 border-t border-slate-100 pt-3">
                                    <h4 className="text-xs font-bold uppercase text-slate-500">
                                        Ricerca ordine
                                    </h4>
                                    <input
                                        value={orderQ}
                                        onChange={(e) => setOrderQ(e.target.value)}
                                        placeholder="Codice, defunto, città…"
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                                    />
                                    {orderHits.length > 0 && (
                                        <ul className="space-y-1 max-h-36 overflow-y-auto">
                                            {orderHits.map((o) => (
                                                <li key={o.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedOrderId(o.id)
                                                        }
                                                        className={`w-full text-left text-xs px-2 py-1.5 rounded-lg border ${
                                                            selectedOrderId === o.id
                                                                ? 'border-amber-400 bg-amber-50'
                                                                : 'border-slate-100 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <strong>
                                                            {o.orderNumber || o.id.slice(0, 8)}
                                                        </strong>{' '}
                                                        — {o.deceasedName || '—'}
                                                        {o.cemeteryCity
                                                            ? ` · ${o.cemeteryCity}`
                                                            : ''}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {selected.amountCents < 0 && (
                                    <div className="space-y-2 border-t border-slate-100 pt-3">
                                        <h4 className="text-xs font-bold uppercase text-slate-500">
                                            Documento già in Contabilità
                                        </h4>
                                        <p className="text-[11px] text-slate-500">
                                            Scegli una fattura YouDOX / upload / spesa già
                                            archiviata — non serve caricarla dal Mac.
                                        </p>
                                        <input
                                            value={docQ}
                                            onChange={(e) => {
                                                setDocQ(e.target.value);
                                                setSelectedDoc(null);
                                            }}
                                            placeholder="Fornitore, n. fattura, file…"
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                                        />
                                        {loadingDocs ? (
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <Loader2 size={12} className="animate-spin" />
                                                Cerco documenti vicini all&apos;importo…
                                            </div>
                                        ) : docHits.length === 0 ? (
                                            <p className="text-xs text-slate-500">
                                                Nessun documento vicino a{' '}
                                                {formatEuro(Math.abs(selected.amountCents))}
                                                {docQ ? ` per «${docQ}»` : ''}.
                                            </p>
                                        ) : (
                                            <ul className="space-y-1 max-h-44 overflow-y-auto">
                                                {docHits.map((d) => {
                                                    const active = selectedDoc?.id === d.id;
                                                    return (
                                                        <li key={d.id}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedDoc(d);
                                                                    setCategory(
                                                                        d.suggestedMatchType
                                                                    );
                                                                }}
                                                                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg border ${
                                                                    active
                                                                        ? 'border-amber-400 bg-amber-50'
                                                                        : 'border-slate-100 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                <div className="flex justify-between gap-2">
                                                                    <span className="font-semibold text-slate-800">
                                                                        {d.vendorName}
                                                                        {d.invoiceNumber
                                                                            ? ` · n. ${d.invoiceNumber}`
                                                                            : ''}
                                                                    </span>
                                                                    <span className="tabular-nums font-bold text-rose-700 shrink-0">
                                                                        {formatEuro(
                                                                            -Math.abs(
                                                                                d.totalCents
                                                                            )
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                                    {formatDay(d.expenseDate)} ·{' '}
                                                                    {d.docType}
                                                                    {d.ingestChannel
                                                                        ? ` · ${d.ingestChannel}`
                                                                        : ''}
                                                                    {d.fileName
                                                                        ? ` · ${d.fileName}`
                                                                        : ''}
                                                                    {d.reconciled
                                                                        ? ' · già riconciliata'
                                                                        : ''}
                                                                </div>
                                                            </button>
                                                            {active && d.fileUrl ? (
                                                                <a
                                                                    href={d.fileUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-block mt-1 text-[10px] font-semibold text-amber-800 underline"
                                                                >
                                                                    Apri allegato
                                                                </a>
                                                            ) : null}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                        {selectedDoc ? (
                                            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                                                Selezionato: {selectedDoc.vendorName}
                                                {selectedDoc.invoiceNumber
                                                    ? ` n. ${selectedDoc.invoiceNumber}`
                                                    : ''}{' '}
                                                — Conferma per abbinare.
                                            </p>
                                        ) : null}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold uppercase text-slate-500">
                                        Categoria contabile
                                    </h4>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                                    >
                                        {categoryOptions.map((c) => (
                                            <option key={c.matchType} value={c.matchType}>
                                                {c.label}
                                            </option>
                                        ))}
                                    </select>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={2}
                                        placeholder="Note (facoltative)"
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={saving}
                                            onClick={() => void confirmCategoryOrOrder()}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
                                        >
                                            {saving ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Check size={14} />
                                            )}
                                            Conferma
                                        </button>
                                        <button
                                            type="button"
                                            disabled={saving || selectedIndex < 0}
                                            onClick={() => selectByIndex(selectedIndex + 1)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                                        >
                                            <X size={14} />
                                            Salta
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Ultime 20 manuali + undo */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Ultime riconciliazioni manuali
                </div>
                {recent.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">Nessuna riconciliazione manuale recente.</p>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {recent.map((item) => (
                            <li
                                key={item.lineId}
                                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                            >
                                <div className="min-w-0 text-sm">
                                    <div className="text-[11px] text-slate-500">
                                        {new Date(item.updatedAt).toLocaleString('it-IT')} ·{' '}
                                        {formatDay(item.accountingDate)} · {item.documentFileName}
                                    </div>
                                    <div className="text-slate-800 line-clamp-1">
                                        {item.description}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                        {item.matchType} · {item.matchNotes}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span
                                        className={`text-sm font-bold tabular-nums ${
                                            item.amountCents >= 0
                                                ? 'text-emerald-700'
                                                : 'text-rose-700'
                                        }`}
                                    >
                                        {formatEuro(item.amountCents)}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void unmatchRecent(item)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                        title="Annulla abbinamento"
                                    >
                                        <Undo2 size={12} />
                                        Annulla
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
