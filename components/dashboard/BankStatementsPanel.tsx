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
    Search,
    Trash2,
    UploadCloud,
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
};

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
        return { text: 'Riconciliato', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    }
    if (status === 'PARTIAL') {
        return { text: 'In attesa', className: 'bg-amber-50 text-amber-700 border-amber-100' };
    }
    return { text: 'Non abbinato', className: 'bg-slate-100 text-slate-600 border-slate-200' };
}

function categoryOf(line: StatementLine): 'Entrata' | 'Uscita' | 'Onere Bancario' {
    const t = (line.matchType || '').toUpperCase();
    const d = line.description.toUpperCase();
    if (
        t === 'BANK_FEE' ||
        t === 'TAX_PAYMENT' ||
        /IMPOSTA DI BOLLO|CANONE|SPESE DI TENUTA|COMMISSIONI|COMPETENZE|\bF24\b/.test(d)
    ) {
        return 'Onere Bancario';
    }
    return line.amountCents >= 0 ? 'Entrata' : 'Uscita';
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
    const [lines, setLines] = useState<StatementLine[]>([]);
    const [linesLoading, setLinesLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [matchingLineId, setMatchingLineId] = useState<string | null>(null);
    const [matchDraft, setMatchDraft] = useState<{
        lineId: string;
        orderId: string;
        notes: string;
    } | null>(null);

    const loadLines = useCallback(async (docId: string) => {
        setLinesLoading(true);
        try {
            const res = await fetch(`/api/dashboard/finance/bank-statements/${docId}`);
            const parsed = await readJsonResponse<{
                ok?: boolean;
                document?: StatementDoc;
                error?: string;
            }>(res);
            if (!parsed.ok || !parsed.data?.document) {
                throw new Error(parsed.error || 'Dettaglio rendiconto non disponibile');
            }
            setActiveDocId(docId);
            setLines(parsed.data.document.lines || []);
            setUploadSummary((prev) => prev || docSummary(parsed.data!.document!) || null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento movimenti');
        } finally {
            setLinesLoading(false);
        }
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
                const preferred =
                    list.find((d) => d.id === activeDocId) ||
                    list.find((d) => d.status === 'RECONCILED' || d.status === 'PARSED') ||
                    list[0];
                if (preferred) await loadLines(preferred.id);
            } else {
                setLines([]);
                setActiveDocId(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore archivio rendiconti');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- activeDocId solo come preferenza al refresh
    }, [loadLines]);

    useEffect(() => {
        void load();
    }, [load]);

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
            if (newId) await loadLines(newId);
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
                setLines([]);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Eliminazione fallita');
        } finally {
            setDeletingId(null);
        }
    };

    const submitManualMatch = async () => {
        if (!matchDraft || !activeDocId) return;
        setMatchingLineId(matchDraft.lineId);
        try {
            const res = await fetch(
                `/api/dashboard/finance/bank-statements/${activeDocId}/lines/${matchDraft.lineId}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        matchedOrderId: matchDraft.orderId.trim() || null,
                        matchNotes: matchDraft.notes.trim() || 'Abbinamento manuale',
                        matchType: matchDraft.orderId.trim() ? 'MANUAL_ORDER' : 'MANUAL_MATCH',
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
            setMatchDraft(null);
            await loadLines(activeDocId);
            setDocs((prev) =>
                prev.map((d) =>
                    d.id === activeDocId
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

    const filteredLines = useMemo(() => {
        const q = search.trim().toLowerCase();
        return lines.filter((line) => {
            if (statusFilter === 'MATCHED' && line.matchStatus !== 'MATCHED') return false;
            if (statusFilter === 'UNMATCHED' && line.matchStatus === 'MATCHED') return false;
            if (!q) return true;
            return (
                line.description.toLowerCase().includes(q) ||
                (line.matchNotes || '').toLowerCase().includes(q) ||
                (line.matchType || '').toLowerCase().includes(q)
            );
        });
    }, [lines, search, statusFilter]);

    const activeDoc = docs.find((d) => d.id === activeDocId) || null;
    const tableSummary =
        uploadSummary ||
        (activeDoc
            ? docSummary(activeDoc) ||
              `${lines.length} movimenti estratti • ${activeDoc.matchedCount} riconciliati / ${activeDoc.unmatchedCount} non abbinati`
            : null);

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

            {/* Tabella movimenti estratto conto */}
            {activeDocId && (
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-3 sm:p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div>
                            <h5 className="text-sm font-bold text-slate-800">
                                Movimenti estratto conto
                            </h5>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                {activeDoc?.fileName || 'Rendiconto'} · {filteredLines.length}/
                                {lines.length} righe visualizzate
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
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
                                        ['MATCHED', 'Solo Riconciliati'],
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

                    {matchDraft && (
                        <div className="rounded-xl border border-[#c5a880]/40 bg-[#c5a880]/10 px-3 py-3 space-y-2">
                            <p className="text-xs font-semibold text-slate-700">
                                Abbina / Associa movimento
                            </p>
                            <div className="grid sm:grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    value={matchDraft.orderId}
                                    onChange={(e) =>
                                        setMatchDraft({ ...matchDraft, orderId: e.target.value })
                                    }
                                    placeholder="ID ordine (opzionale)"
                                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
                                />
                                <input
                                    type="text"
                                    value={matchDraft.notes}
                                    onChange={(e) =>
                                        setMatchDraft({ ...matchDraft, notes: e.target.value })
                                    }
                                    placeholder="Nota (compenso fiorista, fattura, spesa…)"
                                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={matchingLineId === matchDraft.lineId}
                                    onClick={() => void submitManualMatch()}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-50"
                                >
                                    {matchingLineId === matchDraft.lineId ? (
                                        <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                        <Link2 size={13} />
                                    )}
                                    Conferma abbinamento
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMatchDraft(null)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
                                >
                                    Annulla
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-sm min-w-[960px]">
                            <thead>
                                <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-400">
                                    <th className="px-3 py-2 font-bold">Data op.</th>
                                    <th className="px-3 py-2 font-bold">Data valuta</th>
                                    <th className="px-3 py-2 font-bold">Descrizione / Causale</th>
                                    <th className="px-3 py-2 font-bold">Tipo</th>
                                    <th className="px-3 py-2 font-bold text-right">Importo</th>
                                    <th className="px-3 py-2 font-bold">Stato</th>
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
                                            Nessun movimento con i filtri correnti.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLines.map((line) => {
                                        const badge = lineMatchBadge(line.matchStatus);
                                        const cat = categoryOf(line);
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
                                                <td className="px-3 py-2.5 text-slate-800 max-w-[360px]">
                                                    <div className="text-xs leading-snug">
                                                        {line.description}
                                                    </div>
                                                    {line.matchNotes && (
                                                        <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                                                            {line.matchNotes}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                                            cat === 'Entrata'
                                                                ? 'bg-emerald-50 text-emerald-700'
                                                                : cat === 'Onere Bancario'
                                                                  ? 'bg-violet-50 text-violet-700'
                                                                  : 'bg-rose-50 text-rose-700'
                                                        }`}
                                                    >
                                                        {cat}
                                                    </span>
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
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${badge.className}`}
                                                    >
                                                        {badge.text}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setMatchDraft({
                                                                lineId: line.id,
                                                                orderId: line.matchedOrderId || '',
                                                                notes: line.matchNotes || '',
                                                            })
                                                        }
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-white text-[11px] font-semibold"
                                                    >
                                                        <Link2 size={12} />
                                                        Abbina / Associa
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
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
