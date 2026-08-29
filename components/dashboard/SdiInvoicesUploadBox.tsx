'use client';

/**
 * Upload massivo fatture elettroniche SDI / YouDoox (ZIP XML o CSV).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileArchive, Loader2, RefreshCw, UploadCloud } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import UploadedInvoicesFileList, {
    type UploadedFileRow,
} from '@/components/dashboard/UploadedInvoicesFileList';

type Props = {
    onImported?: () => void;
};

type IngestSummary = {
    imported: number;
    updated?: number;
    skippedDuplicates: number;
    skippedErrors: number;
    matchedFineco: number;
    creditNotes?: number;
    totalCents: number;
    warnings: string[];
    skippedDetails?: Array<{ fileName: string; reason: string }>;
    sampleVendors?: string[];
};

export default function SdiInvoicesUploadBox({ onImported }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<IngestSummary | null>(null);
    const [uploads, setUploads] = useState<UploadedFileRow[]>([]);
    const [dupWarn, setDupWarn] = useState<string | null>(null);

    const loadUploads = useCallback(async () => {
        try {
            const res = await fetch('/api/dashboard/finance/invoices/uploads?channel=SDI_XML');
            const parsed = await readJsonResponse<{
                ok?: boolean;
                uploads?: UploadedFileRow[];
            }>(res);
            if (parsed.ok) setUploads(parsed.data?.uploads || []);
        } catch {
            /* silent */
        }
    }, []);

    useEffect(() => {
        void loadUploads();
    }, [loadUploads]);

    const handleSyncYoudox = async () => {
        setSyncing(true);
        setError(null);
        setMessage(null);
        setSummary(null);
        try {
            const res = await fetch('/api/v1/finance/youdox/sync', { method: 'POST' });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Impossibile sincronizzare con YouDOX SDI');
            }
            setMessage(
                `Sincronizzazione YouDOX completata! Polled: ${data.polled || 0}, Importate: ${data.imported || 0}, Aggiornate: ${data.updated || 0}.`
            );
            await loadUploads();
            onImported?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore durante la sincronizzazione YouDOX');
        } finally {
            setSyncing(false);
        }
    };

    const uploadOne = async (file: File): Promise<string | null> => {
        try {
            const check = await fetch(
                `/api/dashboard/finance/invoices/uploads?channel=SDI_XML&checkFileName=${encodeURIComponent(file.name)}`
            );
            const checked = await readJsonResponse<{
                ok?: boolean;
                exists?: boolean;
                upload?: { uploadedAt?: string; invoiceCount?: number };
            }>(check);
            if (checked.data?.exists) {
                const when = checked.data.upload?.uploadedAt
                    ? new Date(checked.data.upload.uploadedAt).toLocaleString('it-IT')
                    : 'in precedenza';
                const ok = window.confirm(
                    `Il file «${file.name}» risulta già caricato (${when}, ${checked.data.upload?.invoiceCount ?? '?'} fatture).\n\nVuoi caricarlo di nuovo? I duplicati invariati verranno saltati.`
                );
                if (!ok) {
                    setDupWarn(`Saltato: «${file.name}» già presente.`);
                    return null;
                }
                setDupWarn(`Attenzione: re-import di «${file.name}».`);
            }
        } catch {
            /* proceed */
        }

        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/dashboard/finance/invoices/upload', {
            method: 'POST',
            body: form,
        });
        const parsed = await readJsonResponse<{
            ok?: boolean;
            error?: string;
            message?: string;
            summary?: IngestSummary;
        }>(res);
        if (!parsed.ok && !parsed.data?.summary?.skippedDuplicates) {
            throw new Error(parsed.error || parsed.data?.message || `Upload fallito: ${file.name}`);
        }
        return parsed.data?.message || `OK ${file.name}`;
    };

    const uploadMany = async (files: FileList | File[]) => {
        const list = Array.from(files).filter(Boolean);
        if (!list.length) return;
        setUploading(true);
        setError(null);
        setMessage(null);
        setSummary(null);
        setDupWarn(null);
        const notes: string[] = [];
        try {
            for (const f of list) {
                const msg = await uploadOne(f);
                if (msg) notes.push(msg);
            }
            setMessage(
                notes.length
                    ? notes.join(' | ')
                    : 'Nessun file importato (tutti annullati o già presenti).'
            );
            await loadUploads();
            onImported?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload fallito');
            await loadUploads();
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-full min-h-[520px] flex flex-col gap-3 overflow-hidden">
            <div className="flex items-start justify-between gap-3 shrink-0 min-h-[4.5rem]">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-slate-900/5 p-2.5 text-slate-700">
                        <FileArchive size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                            Fatture Passive SDI / YouDOX
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Carica uno ZIP di XML FatturaPA, un singolo XML o un CSV esportato da YouDOX/SDI.
                            Deduplica automatica; correzioni e note di credito (TD04) aggiornano i documenti già presenti
                            e riconciliano Fineco.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    disabled={uploading || syncing}
                    onClick={handleSyncYoudox}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-colors shrink-0 shadow-sm"
                >
                    {syncing ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <RefreshCw size={14} />
                    )}
                    {syncing ? 'Sincronizzazione…' : 'Sincronizza YouDOX SDI'}
                </button>
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
                    const files = e.dataTransfer.files;
                    if (files?.length) void uploadMany(files);
                }}
                className={`rounded-2xl border-2 border-dashed px-4 py-4 transition-colors shrink-0 ${
                    dragOver
                        ? 'border-[#c5a880] bg-[#c5a880]/10'
                        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300'
                }`}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                        <UploadCloud className="text-[#c5a880] shrink-0" size={22} />
                        <span>
                            Trascina ZIP o più XML FatturaPA (selezione multipla), oppure seleziona i
                            file
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
                            <FileArchive size={14} />
                        )}
                        {uploading ? 'Importazione…' : 'Carica ZIP / XML (multi)'}
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept=".zip,.xml,.csv,application/zip,text/xml,text/csv"
                        className="hidden"
                        onChange={(e) => {
                            const files = e.target.files;
                            if (files?.length) void uploadMany(files);
                        }}
                    />
                </div>
            </div>

            <div className="flex flex-col flex-1 min-h-0 gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                    File caricati ({uploads.length})
                </p>
                <UploadedInvoicesFileList
                    uploads={uploads}
                    fillHeight
                    onChanged={() => void loadUploads()}
                />
            </div>

            {(dupWarn || message || error) && (
                <div className="shrink-0 max-h-[72px] overflow-y-auto space-y-1.5">
            {dupWarn && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    {dupWarn}
                </div>
            )}

            {message && (
                <div className="text-xs text-slate-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 space-y-1">
                    <p className="font-medium">{message}</p>
                    {summary?.sampleVendors && summary.sampleVendors.length > 0 && (
                        <p className="text-[11px] text-slate-500">
                            Fornitori: {summary.sampleVendors.join(' · ')}
                        </p>
                    )}
                    {summary?.warnings?.length ? (
                        <p className="text-[11px] text-amber-700">{summary.warnings.join(' | ')}</p>
                    ) : null}
                </div>
            )}

            {error && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    {error}
                </div>
            )}
                </div>
            )}
        </div>
    );
}
