'use client';

/**
 * Upload + archivio estratti conto Fineco + tabella completa movimenti riconciliati.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown,
    Download,
    FileUp,
    Link2,
    Loader2,
    RefreshCw,
    Search,
    Trash2,
    UploadCloud,
    X,
} from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type ParseAnomaly = {
    code: string;
    message: string;
    severity?: 'info' | 'warn' | 'error';
    page?: number;
    raw?: string;
};

type StatementLine = {
    id: string;
    documentId: string;
    lineIndex: number;
    valueDate: string | null;
    accountingDate: string | null;
    description: string;
    amountCents: number;
    debitCents: number | null;
    creditCents: number | null;
    balanceCents: number | null;
    matchStatus: string;
    matchType: string | null;
    matchScore: number | null;
    matchedTxId: string | null;
    matchedOrderId: string | null;
    matchNotes: string | null;
    fileName?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    quarterLabel?: string | null;
};

type YearFilter = 'all' | number;

type StatementDoc = {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    periodStart: string | null;
    periodEnd: string | null;
    status: string;
    parseError: string | null;
    closingBalanceCents: number | null;
    matchedCount: number;
    unmatchedCount: number;
    uploadedAt: string;
    processedAt: string | null;
    metadataJson?: {
        movementCount?: number;
        ignoredMarginNotes?: number;
        parseSummary?: string;
        anomalies?: ParseAnomaly[];
        warnings?: string[];
    } | null;
    lines?: StatementLine[];
};

type StatusFilter = 'ALL' | 'MATCHED' | 'UNMATCHED';

type MatchSuggestion = {
    kind: 'SDI_INVOICE' | 'FLORIST_ORDER' | 'INTERNAL' | 'CATEGORY';
    label: string;
    score: number;
    matchType: string;
    matchedTxId?: string | null;
    matchedOrderId?: string | null;
    expenseId?: string | null;
    notes: string;
};

const CATEGORY_OPTIONS = [
    { matchType: 'SDI_INVOICE', label: 'Fattura Fornitore' },
    { matchType: 'FLORIST_TRANSFER', label: 'Compenso Fiorista' },
    { matchType: 'CASH_EXPENSE', label: 'Spesa senza Fattura (Scontrino/Ricevuta)' },
    { matchType: 'INTERNAL_TRANSFER', label: 'Giroconto / Patrimonio' },
    { matchType: 'OTHER_REVENUE', label: 'Altro Ricavo' },
] as const;

function formatPeriod(start: string | null, end: string | null): string {
    if (!start && !end) return '—';
    const a = start ? start.slice(0, 10) : '?';
    const b = end ? end.slice(0, 10) : '?';
    return a === b ? a : `${a} → ${b}`;
}

function formatItDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return '—';
    }
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function formatEuro(cents: number): string {
    const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
    return `${sign}€${(Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function statusLabel(status: string): { text: string; className: string } {
    switch (status) {
        case 'RECONCILED':
            return { text: 'Riconciliato', className: 'bg-emerald-50 text-emerald-700' };
        case 'PARSED':
            return { text: 'In attesa', className: 'bg-amber-50 text-amber-700' };
        case 'PARSING':
            return { text: 'In elaborazione', className: 'bg-sky-50 text-sky-700' };
        case 'FAILED':
            return { text: 'Non abbinato / errore', className: 'bg-rose-50 text-rose-700' };
        default:
            return { text: status || 'In attesa', className: 'bg-slate-100 text-slate-600' };
    }
}

function lineMatchBadge(status: string): { text: string; className: string } {
    if (status === 'MATCHED') {
        return { text: 'Abbinato', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    }
    if (status === 'PARTIAL') {
        return { text: 'Parziale', className: 'bg-amber-50 text-amber-700 border-amber-100' };
    }
    return { text: 'Non abbinato', className: 'bg-slate-100 text-slate-600 border-slate-200' };
}

function currentCalendarYear(): number {
    return new Date().getFullYear();
}

function docSummary(doc: StatementDoc): string | null {
    return doc.metadataJson?.parseSummary || null;
}

function warnAnomalies(doc: StatementDoc): ParseAnomaly[] {
    return (doc.metadataJson?.anomalies || []).filter(
        (a) => a.severity === 'warn' || a.severity === 'error' || !a.severity
    );
}

export default function BankStatementsPanel() {
    const inputRef = useRef<HTMLInputElement>(null);
    const [docs, setDocs] = useState<StatementDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [textPreview, setTextPreview] = useState<string[] | null>(null);
    const [uploadSummary, setUploadSummary] = useState<string | null>(null);
    const [uploadAnomalies, setUploadAnomalies] = useState<ParseAnomaly[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [openAnomalyDocId, setOpenAnomalyDocId] = useState<string | null>(null);

    const [activeDocId, setActiveDocId] = useState<string | null>(null);
    const [yearFilter, setYearFilter] = useState<YearFilter>(currentCalendarYear());
    const [availableYears, setAvailableYears] = useState<number[]>([currentCalendarYear()]);
    const [lines, setLines] = useState<StatementLine[]>([]);
    const [linesLoading, setLinesLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [matchingLineId, setMatchingLineId] = useState<string | null>(null);
    const [reReconciling, setReReconciling] = useState(false);
    const [matchModal, setMatchModal] = useState<{
        line: StatementLine;
        suggestions: MatchSuggestion[];
        loadingSuggestions: boolean;
        category: string;
        notes: string;
        orderId: string;
    } | null>(null);

    const loadMovements = useCallback(async (year: YearFilter) => {
        setLinesLoading(true);
        try {
            const qs =
                year === 'all'
                    ? 'view=movements&year=all'
                    : `view=movements&year=${encodeURIComponent(String(year))}`;
            const res = await fetch(`/api/dashboard/finance/bank-statements?${qs}`);
            const parsed = await readJsonResponse<{
                ok?: boolean;
                lines?: StatementLine[];
                years?: number[];
                error?: string;
            }>(res);
            if (!parsed.ok || !parsed.data) {
                throw new Error(parsed.error || 'Movimenti non disponibili');
            }
            setLines(parsed.data.lines || []);
            const years = (parsed.data.years || []).filter((y) => Number.isFinite(y));
            if (years.length > 0) {
                setAvailableYears(years);
            } else if (year !== 'all' && typeof year === 'number') {
                setAvailableYears((prev) =>
                    prev.includes(year) ? prev : [...prev, year].sort((a, b) => b - a)
                );
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento movimenti');
        } finally {
            setLinesLoading(false);
        }
    }, []);

    const loadLines = useCallback(async (docId: string) => {
        setActiveDocId(docId);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/bank-statements');
            const parsed = await readJsonResponse<{
                ok?: boolean;
                documents?: StatementDoc[];
                error?: string;
            }>(res);
            if (!parsed.ok || !parsed.data) {
                throw new Error(parsed.error || 'Caricamento fallito');
            }
            const list = parsed.data.documents || [];
            setDocs(list);
            if (list.length > 0) {
                setActiveDocId((prev) => prev || list[0]?.id || null);
            } else {
                setActiveDocId(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore archivio rendiconti');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        void loadMovements(yearFilter);
    }, [yearFilter, loadMovements]);

    const uploadFile = async (file: File) => {
        setUploading(true);
        setError(null);
        setTextPreview(null);
        setUploadSummary(null);
        setUploadAnomalies([]);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/dashboard/finance/bank-statements/upload', {
                method: 'POST',
                body: form,
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                textPreview?: string[];
                parseSummary?: string;
                anomalies?: ParseAnomaly[];
                document?: StatementDoc & {
                    metadataJson?: {
                        textPreview?: string[];
                        parseSummary?: string;
                        anomalies?: ParseAnomaly[];
                    };
                };
            }>(res);
            if (!parsed.ok) {
                const preview =
                    parsed.data?.textPreview ||
                    parsed.data?.document?.metadataJson?.textPreview ||
                    null;
                if (preview?.length) setTextPreview(preview);
                await load();
                throw new Error(parsed.error || 'Upload fallito');
            }

            const summary =
                parsed.data?.parseSummary ||
                parsed.data?.document?.metadataJson?.parseSummary ||
                null;
            const anomalies =
                parsed.data?.anomalies ||
                parsed.data?.document?.metadataJson?.anomalies ||
                [];
            setUploadSummary(summary);
            setUploadAnomalies(
                anomalies.filter((a) => a.severity === 'warn' || a.severity === 'error')
            );
            const newId = parsed.data?.document?.id;
            await load();
            await loadMovements(yearFilter);
            if (newId) setActiveDocId(newId);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload fallito');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const onFiles = (files: FileList | null) => {
        const file = files?.[0];
        if (file) void uploadFile(file);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Eliminare questo rendiconto e i movimenti estratti?')) return;
        setDeletingId(id);
        try {
            const res = await fetch(`/api/dashboard/finance/bank-statements/${id}`, {
                method: 'DELETE',
            });
            const parsed = await readJsonResponse(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Eliminazione fallita');
            setDocs((prev) => prev.filter((d) => d.id !== id));
            if (activeDocId === id) {
                setActiveDocId(null);
            }
            await loadMovements(yearFilter);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Eliminazione fallita');
        } finally {
            setDeletingId(null);
        }
    };

    const openMatchModal = async (line: StatementLine) => {
        const docId = line.documentId;
        if (!docId) return;
        setMatchModal({
            line,
            suggestions: [],
            loadingSuggestions: true,
            category: line.amountCents >= 0 ? 'OTHER_REVENUE' : 'SDI_INVOICE',
            notes: '',
            orderId: line.matchedOrderId || '',
        });
        try {
            const res = await fetch(
                `/api/dashboard/finance/bank-statements/${docId}/lines/${line.id}/suggestions`
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                suggestions?: MatchSuggestion[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Suggerimenti non disponibili');
            setMatchModal((prev) =>
                prev && prev.line.id === line.id
                    ? {
                          ...prev,
                          suggestions: parsed.data?.suggestions || [],
                          loadingSuggestions: false,
                      }
                    : prev
            );
        } catch {
            setMatchModal((prev) =>
                prev && prev.line.id === line.id
                    ? { ...prev, loadingSuggestions: false, suggestions: [] }
                    : prev
            );
        }
    };

    const applyMatch = async (payload: {
        matchType: string;
        matchNotes: string;
        matchedOrderId?: string | null;
        matchedTxId?: string | null;
        expenseId?: string | null;
    }) => {
        if (!matchModal || !matchModal.line.documentId) return;
        const lineId = matchModal.line.id;
        const docId = matchModal.line.documentId;
        setMatchingLineId(lineId);
        try {
            const res = await fetch(
                `/api/dashboard/finance/bank-statements/${docId}/lines/${lineId}`,
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
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                matchedCount?: number;
                unmatchedCount?: number;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Abbinamento fallito');
            setMatchModal(null);
            await loadMovements(yearFilter);
            setDocs((prev) =>
                prev.map((d) =>
                    d.id === docId
                        ? {
                              ...d,
                              matchedCount: parsed.data?.matchedCount ?? d.matchedCount,
                              unmatchedCount: parsed.data?.unmatchedCount ?? d.unmatchedCount,
                          }
                        : d
                )
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Abbinamento fallito');
        } finally {
            setMatchingLineId(null);
        }
    };

    const confirmSuggestion = (s: MatchSuggestion) => {
        void applyMatch({
            matchType: s.matchType,
            matchNotes: s.notes || s.label,
            matchedOrderId: s.matchedOrderId,
            matchedTxId: s.matchedTxId,
            expenseId: s.expenseId,
        });
    };

    const submitCategoryMatch = () => {
        if (!matchModal) return;
        const catLabel =
            CATEGORY_OPTIONS.find((c) => c.matchType === matchModal.category)?.label ||
            matchModal.category;
        void applyMatch({
            matchType: matchModal.category,
            matchNotes:
                matchModal.notes.trim() ||
                `Riconciliato Manualmente — ${catLabel}`,
            matchedOrderId: matchModal.orderId.trim() || null,
        });
    };

    const runReReconcile = async () => {
        if (!activeDocId) return;
        setReReconciling(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/bank-statements/${activeDocId}/re-reconcile`,
                { method: 'POST' }
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                message?: string;
                matched?: number;
                stillUnmatched?: number;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Ri-analisi fallita');
            setUploadSummary(parsed.data?.message || null);
            await loadMovements(yearFilter);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Ri-analisi fallita');
        } finally {
            setReReconciling(false);
        }
    };

    const filteredLines = useMemo(() => {
        const q = search.trim().toLowerCase();
        return lines.filter((line) => {
            if (statusFilter === 'MATCHED' && line.matchStatus !== 'MATCHED') return false;
            if (statusFilter === 'UNMATCHED' && line.matchStatus === 'MATCHED') return false;
            if (!q) return true;
            return (
                line.description.toLowerCase().includes(q) ||
                (line.matchNotes || '').toLowerCase().includes(q) ||
                (line.matchType || '').toLowerCase().includes(q) ||
                (line.fileName || '').toLowerCase().includes(q)
            );
        });
    }, [lines, search, statusFilter]);

    const yearKpis = useMemo(() => {
        let inflows = 0;
        let outflows = 0;
        let matched = 0;
        for (const line of lines) {
            if (line.amountCents > 0) inflows += line.amountCents;
            else if (line.amountCents < 0) outflows += Math.abs(line.amountCents);
            if (line.matchStatus === 'MATCHED') matched += 1;
        }
        const total = lines.length;
        const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
        return {
            inflows,
            outflows,
            net: inflows - outflows,
            matched,
            total,
            pct,
        };
    }, [lines]);

    const yearTabs = useMemo(() => {
        const years = [...availableYears].sort((a, b) => b - a);
        if (typeof yearFilter === 'number' && !years.includes(yearFilter)) {
            years.unshift(yearFilter);
            years.sort((a, b) => b - a);
        }
        return years;
    }, [availableYears, yearFilter]);

    const activeDoc = docs.find((d) => d.id === activeDocId) || null;
    const tableSummary =
        uploadSummary ||
        (activeDoc
            ? docSummary(activeDoc) ||
              `${activeDoc.matchedCount} riconciliati / ${activeDoc.unmatchedCount} non abbinati`
            : null);

    const yearLabel =
        yearFilter === 'all' ? 'tutti gli anni' : String(yearFilter);

    return (
        <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                        Estratti Conto &amp; Rendiconti
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Carica PDF/CSV/Excel Fineco: auto-match payout Stripe/PayPal, oneri bancari, compensi fioristi e spese manuali.
                    </p>
                </div>
            </div>

            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    onFiles(e.dataTransfer.files);
                }}
                className={`rounded-2xl border-2 border-dashed px-4 py-5 transition-colors ${
                    dragOver
                        ? 'border-[#c5a880] bg-[#c5a880]/10'
                        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300'
                }`}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                        <UploadCloud className="text-[#c5a880] shrink-0" size={22} />
                        <span>
                            Trascina qui il rendiconto oppure seleziona un file (PDF, CSV, Excel — max 15 MB)
                        </span>
                    </div>
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                        {uploading ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <FileUp size={14} />
                        )}
                        {uploading ? 'Elaborazione…' : 'Carica Rendiconto Bancario'}
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        onChange={(e) => onFiles(e.target.files)}
                    />
                </div>
            </div>

            {tableSummary && !error && (
                <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 space-y-2">
                    <p className="font-medium">{tableSummary}</p>
                    {uploadAnomalies.length > 0 && (
                        <details className="group">
                            <summary className="cursor-pointer list-none flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                <ChevronDown
                                    size={14}
                                    className="transition-transform group-open:rotate-180"
                                />
                                Dettagli anomalie ({uploadAnomalies.length})
                            </summary>
                            <ul className="mt-2 space-y-1.5 font-mono text-[10px] text-slate-600">
                                {uploadAnomalies.map((a, i) => (
                                    <li
                                        key={`${a.code}-${i}`}
                                        className="rounded-lg bg-white border border-slate-100 px-2 py-1.5"
                                    >
                                        <span className="font-bold text-amber-700">{a.code}</span>
                                        {a.page != null ? ` · pag. ${a.page}` : ''} — {a.message}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}

            {error && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 space-y-2">
                    <p>{error}</p>
                    {textPreview && textPreview.length > 0 && (
                        <div className="bg-white/70 border border-rose-100 rounded-lg p-2 font-mono text-[10px] text-slate-700 space-y-0.5">
                            <p className="font-bold uppercase tracking-wider text-slate-500 mb-1">
                                Preview testo PDF (prime {textPreview.length} righe)
                            </p>
                            {textPreview.map((line, i) => (
                                <div key={i} className="truncate">
                                    {i + 1}. {line}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Tabella movimenti estratto conto — archivio storico per anno */}
            <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-3 sm:p-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                        <h5 className="text-sm font-bold text-slate-800">
                            Movimenti estratto conto
                        </h5>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            Archivio completo · {yearLabel} · {filteredLines.length}/
                            {lines.length} righe visualizzate
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <button
                            type="button"
                            disabled={reReconciling || linesLoading || !activeDocId}
                            onClick={() => void runReReconcile()}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            title="Ri-applica le regole di auto-match sul rendiconto selezionato in archivio"
                        >
                            {reReconciling ? (
                                <Loader2 size={13} className="animate-spin" />
                            ) : (
                                <RefreshCw size={13} />
                            )}
                            Ri-analizza non abbinati
                        </button>
                        <div className="relative">
                            <Search
                                size={14}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Cerca causale / beneficiario…"
                                className="w-full sm:w-64 pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#c5a880]/40"
                            />
                        </div>
                        <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-[11px] font-semibold">
                            {(
                                [
                                    ['ALL', 'Tutti'],
                                    ['MATCHED', 'Solo Abbinati'],
                                    ['UNMATCHED', 'Solo Non Abbinati'],
                                ] as const
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setStatusFilter(key)}
                                    className={`px-2.5 py-2 ${
                                        statusFilter === key
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="inline-flex flex-wrap rounded-xl border border-slate-200 overflow-hidden text-[11px] font-semibold">
                    <button
                        type="button"
                        onClick={() => setYearFilter('all')}
                        className={`px-3 py-2 ${
                            yearFilter === 'all'
                                ? 'bg-slate-900 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        Tutti gli anni
                    </button>
                    {yearTabs.map((y) => (
                        <button
                            key={y}
                            type="button"
                            onClick={() => setYearFilter(y)}
                            className={`px-3 py-2 border-l border-slate-200 ${
                                yearFilter === y
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {y}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Totale entrate
                        </p>
                        <p className="mt-1 font-mono text-sm font-bold text-emerald-700">
                            €{(yearKpis.inflows / 100).toLocaleString('it-IT', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Totale uscite
                        </p>
                        <p className="mt-1 font-mono text-sm font-bold text-rose-700">
                            €{(yearKpis.outflows / 100).toLocaleString('it-IT', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Saldo netto periodo
                        </p>
                        <p
                            className={`mt-1 font-mono text-sm font-bold ${
                                yearKpis.net >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                        >
                            {formatEuro(yearKpis.net)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Tasso riconciliazione
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-800">
                            {yearKpis.matched}/{yearKpis.total} abbinati
                            <span className="ml-1 font-mono text-slate-500">
                                · {yearKpis.pct}%
                            </span>
                        </p>
                    </div>
                </div>

                <div className="overflow-auto max-h-[min(70vh,900px)] rounded-xl border border-slate-100">
                    <table className="w-full text-sm min-w-[1100px]">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-400">
                                <th className="px-3 py-2 font-bold">Data op.</th>
                                <th className="px-3 py-2 font-bold">Data valuta</th>
                                <th className="px-3 py-2 font-bold">Descrizione / Causale</th>
                                <th className="px-3 py-2 font-bold text-right">Importo</th>
                                <th className="px-3 py-2 font-bold">Stato riconciliazione</th>
                                <th className="px-3 py-2 font-bold">PDF / Trimestre</th>
                                <th className="px-3 py-2 font-bold text-right">Azione</th>
                            </tr>
                        </thead>
                        <tbody>
                            {linesLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                                        <Loader2 className="inline animate-spin mr-2" size={16} />
                                        Caricamento movimenti…
                                    </td>
                                </tr>
                            ) : filteredLines.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-3 py-8 text-center text-slate-400 text-xs"
                                    >
                                        Nessun movimento per {yearLabel} con i filtri correnti.
                                    </td>
                                </tr>
                            ) : (
                                filteredLines.map((line) => {
                                    const badge = lineMatchBadge(line.matchStatus);
                                    const isMatched = line.matchStatus === 'MATCHED';
                                    return (
                                        <tr
                                            key={line.id}
                                            className="border-t border-slate-100 align-top hover:bg-slate-50/60"
                                        >
                                            <td className="px-3 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                                                {formatItDate(line.accountingDate)}
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                                                {formatItDate(line.valueDate)}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-800 min-w-[280px] max-w-[520px]">
                                                <div className="text-xs leading-snug whitespace-pre-wrap break-words">
                                                    {line.description}
                                                </div>
                                            </td>
                                            <td
                                                className={`px-3 py-2.5 text-right font-mono text-xs font-semibold whitespace-nowrap ${
                                                    line.amountCents > 0
                                                        ? 'text-emerald-700'
                                                        : line.amountCents < 0
                                                          ? 'text-rose-700'
                                                          : 'text-slate-600'
                                                }`}
                                            >
                                                {formatEuro(line.amountCents)}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="space-y-1 max-w-[220px]">
                                                    <span
                                                        className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${badge.className}`}
                                                    >
                                                        {badge.text}
                                                    </span>
                                                    {isMatched && line.matchNotes && (
                                                        <div className="text-[10px] text-emerald-800/80 leading-snug">
                                                            {line.matchNotes}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[200px]">
                                                <div
                                                    className="font-medium text-slate-800 truncate"
                                                    title={line.fileName || undefined}
                                                >
                                                    {line.fileName || '—'}
                                                </div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">
                                                    {line.quarterLabel ||
                                                        formatPeriod(
                                                            line.periodStart || null,
                                                            line.periodEnd || null
                                                        )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                {!isMatched ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void openMatchModal(line)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-white text-[11px] font-semibold"
                                                    >
                                                        <Link2 size={12} />
                                                        Abbina
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => void openMatchModal(line)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-100 text-emerald-800 hover:bg-emerald-50 text-[11px] font-semibold"
                                                    >
                                                        <Link2 size={12} />
                                                        Modifica
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <p className="text-[10px] text-slate-400">
                    Elenco completo senza paginazione: {lines.length} movimenti estratti dai
                    rendiconti PDF per {yearLabel} · scroll per scorrere tutte le righe
                </p>
            </div>

            {matchModal && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="match-modal-title"
                >
                    <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-slate-100">
                        <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-white">
                            <h3 id="match-modal-title" className="text-sm font-bold text-slate-800">
                                Abbina / Associa movimento
                            </h3>
                            <button
                                type="button"
                                onClick={() => setMatchModal(null)}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-50"
                                aria-label="Chiudi"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="px-4 py-3 space-y-4">
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 space-y-1">
                                <div className="flex justify-between gap-2 text-xs">
                                    <span className="text-slate-500">Data</span>
                                    <span className="font-mono font-semibold text-slate-800">
                                        {formatItDate(
                                            matchModal.line.accountingDate ||
                                                matchModal.line.valueDate
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-2 text-xs">
                                    <span className="text-slate-500">Importo</span>
                                    <span
                                        className={`font-mono font-bold ${
                                            matchModal.line.amountCents >= 0
                                                ? 'text-emerald-700'
                                                : 'text-rose-700'
                                        }`}
                                    >
                                        {formatEuro(matchModal.line.amountCents)}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-700 leading-snug pt-1 whitespace-pre-wrap break-words">
                                    {matchModal.line.description}
                                </p>
                            </div>

                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                                    Suggerimenti intelligenti
                                </p>
                                {matchModal.loadingSuggestions ? (
                                    <p className="text-xs text-slate-400 flex items-center gap-2">
                                        <Loader2 size={14} className="animate-spin" />
                                        Analisi in corso…
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {matchModal.suggestions
                                            .filter((s) => s.kind !== 'CATEGORY')
                                            .slice(0, 3)
                                            .map((s, i) => (
                                                <li
                                                    key={`${s.matchType}-${i}`}
                                                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-slate-800">
                                                            {s.label}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                                            {s.notes} · score {s.score}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={matchingLineId === matchModal.line.id}
                                                        onClick={() => confirmSuggestion(s)}
                                                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-bold disabled:opacity-50"
                                                    >
                                                        Conferma
                                                    </button>
                                                </li>
                                            ))}
                                        {!matchModal.suggestions.some((s) => s.kind !== 'CATEGORY') && (
                                            <li className="text-xs text-slate-400">
                                                Nessun match automatico forte — scegli una categoria
                                                sotto.
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            <div className="space-y-2">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                    Categoria rapida
                                </p>
                                <select
                                    value={matchModal.category}
                                    onChange={(e) =>
                                        setMatchModal({ ...matchModal, category: e.target.value })
                                    }
                                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                                >
                                    {CATEGORY_OPTIONS.map((c) => (
                                        <option key={c.matchType} value={c.matchType}>
                                            {c.label}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={matchModal.orderId}
                                    onChange={(e) =>
                                        setMatchModal({ ...matchModal, orderId: e.target.value })
                                    }
                                    placeholder="ID ordine (opzionale)"
                                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                                />
                                <input
                                    type="text"
                                    value={matchModal.notes}
                                    onChange={(e) =>
                                        setMatchModal({ ...matchModal, notes: e.target.value })
                                    }
                                    placeholder="Nota libera (opzionale)"
                                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                                />
                            </div>

                            <div className="flex gap-2 pb-2">
                                <button
                                    type="button"
                                    disabled={matchingLineId === matchModal.line.id}
                                    onClick={() => submitCategoryMatch()}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50"
                                >
                                    {matchingLineId === matchModal.line.id ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Link2 size={14} />
                                    )}
                                    Salva come Riconciliato Manualmente
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMatchModal(null)}
                                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
                                >
                                    Annulla
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-400">
                            <th className="px-3 py-2 font-bold">Nome file</th>
                            <th className="px-3 py-2 font-bold">Caricamento</th>
                            <th className="px-3 py-2 font-bold">Periodo</th>
                            <th className="px-3 py-2 font-bold">Stato</th>
                            <th className="px-3 py-2 font-bold">Match</th>
                            <th className="px-3 py-2 font-bold text-right">Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                                    <Loader2 className="inline animate-spin mr-2" size={16} />
                                    Caricamento archivio…
                                </td>
                            </tr>
                        ) : docs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-3 py-6 text-center text-slate-400 text-xs">
                                    Nessun estratto conto caricato. Il primo file popola l&apos;archivio storico.
                                </td>
                            </tr>
                        ) : (
                            docs.map((doc) => {
                                const st = statusLabel(doc.status);
                                const summary = docSummary(doc);
                                const warns = warnAnomalies(doc);
                                const open = openAnomalyDocId === doc.id;
                                const selected = activeDocId === doc.id;
                                return (
                                    <tr
                                        key={doc.id}
                                        className={`border-t border-slate-100 align-top ${
                                            selected ? 'bg-[#c5a880]/5' : ''
                                        }`}
                                    >
                                        <td className="px-3 py-2.5">
                                            <button
                                                type="button"
                                                onClick={() => void loadLines(doc.id)}
                                                className="text-left font-medium text-slate-800 max-w-[220px] truncate hover:underline"
                                            >
                                                {doc.fileName}
                                            </button>
                                            {summary && (
                                                <div className="mt-1 inline-flex max-w-[280px] text-[10px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
                                                    {summary}
                                                </div>
                                            )}
                                            {doc.parseError && warns.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setOpenAnomalyDocId(open ? null : doc.id)
                                                    }
                                                    className="mt-1 flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:underline"
                                                >
                                                    <ChevronDown
                                                        size={12}
                                                        className={`transition-transform ${open ? 'rotate-180' : ''}`}
                                                    />
                                                    Dettagli anomalie ({warns.length})
                                                </button>
                                            )}
                                            {open && warns.length > 0 && (
                                                <ul className="mt-1 space-y-1 max-w-[320px]">
                                                    {warns.map((a, i) => (
                                                        <li
                                                            key={`${doc.id}-${i}`}
                                                            className="text-[10px] font-mono text-slate-600 bg-amber-50/60 border border-amber-100 rounded-lg px-2 py-1"
                                                        >
                                                            {a.message}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                                            {new Date(doc.uploadedAt).toLocaleString('it-IT')}
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-600 font-mono text-xs whitespace-nowrap">
                                            {formatPeriod(doc.periodStart, doc.periodEnd)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span
                                                className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold ${st.className}`}
                                            >
                                                {st.text}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                                            <span className="text-emerald-700 font-semibold">
                                                {doc.matchedCount}
                                            </span>
                                            {' / '}
                                            <span className="text-rose-600 font-semibold">
                                                {doc.unmatchedCount}
                                            </span>
                                            <span className="text-slate-400"> non abbinati</span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => void loadLines(doc.id)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                                                >
                                                    Movimenti
                                                </button>
                                                <a
                                                    href={`/api/dashboard/finance/bank-statements/${doc.id}/download`}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                                                >
                                                    <Download size={13} />
                                                    Download
                                                </a>
                                                <button
                                                    type="button"
                                                    disabled={deletingId === doc.id}
                                                    onClick={() => void handleDelete(doc.id)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                                                >
                                                    {deletingId === doc.id ? (
                                                        <Loader2 size={13} className="animate-spin" />
                                                    ) : (
                                                        <Trash2 size={13} />
                                                    )}
                                                    Elimina
                                                </button>
                                            </div>
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
