'use client';

/**
 * Upload + archivio estratti conto Fineco nella card Conto Corrente Operativo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileUp, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type ParseAnomaly = {
    code: string;
    message: string;
    severity?: 'info' | 'warn' | 'error';
    page?: number;
    raw?: string;
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
};

function formatPeriod(start: string | null, end: string | null): string {
    if (!start && !end) return '—';
    const a = start ? start.slice(0, 10) : '?';
    const b = end ? end.slice(0, 10) : '?';
    return a === b ? a : `${a} → ${b}`;
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
            setDocs(parsed.data.documents || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore archivio rendiconti');
        } finally {
            setLoading(false);
        }
    }, []);

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
                ignoredMarginNotes?: number;
                movementCount?: number;
                document?: {
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
            await load();
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
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Eliminazione fallita');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                        Estratti Conto &amp; Rendiconti
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Carica PDF/CSV/Excel Fineco: matching vs Stripe/PayPal, compensi fioristi, SaaS e spese manuali (stati: Riconciliato / In attesa / Non abbinato).
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

            {uploadSummary && !error && (
                <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 space-y-2">
                    <p className="font-medium">{uploadSummary}</p>
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
                                return (
                                    <tr key={doc.id} className="border-t border-slate-100 align-top">
                                        <td className="px-3 py-2.5">
                                            <div className="font-medium text-slate-800 max-w-[260px] truncate">
                                                {doc.fileName}
                                            </div>
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
