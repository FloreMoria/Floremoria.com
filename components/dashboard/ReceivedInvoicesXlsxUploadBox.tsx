'use client';

/**
 * Upload report fatture ricevute (.xlsx / .csv) — colonne fiscali/SDI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
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
    sampleVendors?: string[];
};

export default function ReceivedInvoicesXlsxUploadBox({ onImported }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<IngestSummary | null>(null);
    const [uploads, setUploads] = useState<UploadedFileRow[]>([]);
    const [dupWarn, setDupWarn] = useState<string | null>(null);

    const loadUploads = useCallback(async () => {
        try {
            const res = await fetch('/api/dashboard/finance/invoices/uploads?channel=SDI_XLSX');
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

    const upload = async (file: File) => {
        setDupWarn(null);
        try {
            const check = await fetch(
                `/api/dashboard/finance/invoices/uploads?channel=SDI_XLSX&checkFileName=${encodeURIComponent(file.name)}`
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
                    `Il report «${file.name}» risulta già caricato (${when}, ${checked.data.upload?.invoiceCount ?? '?'} fatture).\n\nVuoi caricarlo di nuovo? I duplicati invariati verranno saltati.`
                );
                if (!ok) {
                    setDupWarn(`Caricamento annullato: «${file.name}» già presente nello storico.`);
                    if (inputRef.current) inputRef.current.value = '';
                    return;
                }
                setDupWarn(`Attenzione: report già presente — procedo con re-import di «${file.name}».`);
            }
        } catch {
            /* proceed */
        }

        setUploading(true);
        setError(null);
        setMessage(null);
        setSummary(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/dashboard/finance/invoices/upload-xlsx', {
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
                throw new Error(parsed.error || parsed.data?.message || 'Upload fallito');
            }
            setMessage(parsed.data?.message || 'Import completato');
            setSummary(parsed.data?.summary || null);
            await loadUploads();
            onImported?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload fallito');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-full min-h-[520px] flex flex-col gap-3 overflow-hidden">
            <div className="flex items-start gap-3 shrink-0 min-h-[4.5rem]">
                <div className="mt-0.5 rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                    <FileSpreadsheet size={20} />
                </div>
                <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                        Carica Report Fatture Ricevute (.xlsx / .csv)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        Riconosce colonne SDI: Fornitore / Denominazione, Partita IVA / CF, Data Documento,
                        Numero Fattura, Imponibile, IVA / Imposta, Totale Documento. Deduplica invariati;
                        se importo/dati cambiano (o arriva nota di credito) aggiorna il record e riconcilia Fineco.
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
                    const f = e.dataTransfer.files?.[0];
                    if (f) void upload(f);
                }}
                className={`rounded-2xl border-2 border-dashed px-4 py-4 transition-colors shrink-0 ${
                    dragOver
                        ? 'border-emerald-400 bg-emerald-50/60'
                        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300'
                }`}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                        <UploadCloud className="text-emerald-600 shrink-0" size={22} />
                        <span>Trascina qui il report Excel/CSV oppure seleziona un file</span>
                    </div>
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                        {uploading ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <FileSpreadsheet size={14} />
                        )}
                        {uploading ? 'Importazione…' : 'Carica Report Fatture'}
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        className="hidden"
                        onChange={(e) => {
                            const files = e.target.files;
                            if (!files?.length) return;
                            // Sequenziale: un report alla volta
                            void (async () => {
                                for (const f of Array.from(files)) {
                                    await upload(f);
                                }
                            })();
                        }}
                    />
                </div>
            </div>

            <div className="flex flex-col flex-1 min-h-0 gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                    Report caricati ({uploads.length})
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
