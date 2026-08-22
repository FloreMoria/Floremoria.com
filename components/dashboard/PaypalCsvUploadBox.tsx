'use client';

/**
 * Upload CSV estratto conto PayPal → registro contabile storico.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type Props = {
    onImported?: () => void;
};

type ImportSummary = {
    rowsParsed: number;
    inserted: number;
    skipped: number;
    payments: number;
    fees: number;
    refunds: number;
    payouts: number;
    grossInflowEur: string;
    grossOutflowEur: string;
    totalFeesEur: string;
    skippedRows: number;
};

type CsvMeta = {
    lastImportAt: string | null;
    fileName: string | null;
    rowsParsed: number;
    inserted: number;
};

export default function PaypalCsvUploadBox({ onImported }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<ImportSummary | null>(null);
    const [meta, setMeta] = useState<CsvMeta | null>(null);

    const loadMeta = useCallback(async () => {
        try {
            const res = await fetch('/api/dashboard/finance/sync/paypal/upload-csv');
            const parsed = await readJsonResponse<{ ok?: boolean; meta?: CsvMeta | null }>(res);
            if (parsed.ok) setMeta(parsed.data?.meta || null);
        } catch {
            /* silent */
        }
    }, []);

    useEffect(() => {
        void loadMeta();
    }, [loadMeta]);

    const upload = async (file: File) => {
        setUploading(true);
        setError(null);
        setMessage(null);
        setSummary(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/dashboard/finance/sync/paypal/upload-csv', {
                method: 'POST',
                body: form,
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                message?: string;
                summary?: ImportSummary;
                warnings?: string[];
            }>(res);
            if (!parsed.ok) {
                throw new Error(parsed.error || parsed.data?.message || 'Import fallito');
            }
            setMessage(parsed.data?.message || 'Import completato');
            setSummary(parsed.data?.summary || null);
            await loadMeta();
            onImported?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Import fallito');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Storico pregresso — CSV estratto conto
            </p>
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
                className={`rounded-xl border-2 border-dashed px-3 py-3 transition-colors ${
                    dragOver
                        ? 'border-[#0070ba] bg-blue-50/60'
                        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300'
                }`}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <UploadCloud className="text-[#0070ba] shrink-0" size={18} />
                        <span>
                            Trascina il CSV da PayPal (Attività → Cronologia → Scarica) oppure
                            seleziona file
                        </span>
                    </div>
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0070ba] hover:bg-[#005ea6] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                        {uploading ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <FileSpreadsheet size={12} />
                        )}
                        {uploading ? 'Importazione…' : 'Carica CSV PayPal'}
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(f);
                        }}
                    />
                </div>
            </div>

            {meta?.lastImportAt && (
                <p className="text-[10px] text-slate-500">
                    Ultimo CSV:{' '}
                    <span className="font-semibold">
                        {new Date(meta.lastImportAt).toLocaleString('it-IT')}
                    </span>
                    {meta.fileName ? ` · ${meta.fileName}` : ''} · {meta.inserted} scritture
                </p>
            )}

            {message && (
                <div className="text-[11px] text-slate-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2 space-y-1">
                    <p className="font-medium">{message}</p>
                    {summary && (
                        <p className="text-[10px] text-slate-500">
                            {summary.rowsParsed} righe · {summary.inserted} nuove ·{' '}
                            {summary.skipped} duplicate · Pagamenti {summary.payments} · Fee{' '}
                            {summary.fees} · Rimborsi {summary.refunds} · Trasferimenti{' '}
                            {summary.payouts}
                            <br />
                            Entrate €{summary.grossInflowEur} · Uscite €
                            {summary.grossOutflowEur} · Commissioni €{summary.totalFeesEur}
                        </p>
                    )}
                </div>
            )}

            {error && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-2">
                    {error}
                </p>
            )}
        </div>
    );
}
