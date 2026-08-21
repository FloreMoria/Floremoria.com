'use client';

/**
 * Upload Autofatture Estere & Servizi SaaS (TD17 / TD18 / TD19).
 */

import { useRef, useState } from 'react';
import { Globe2, Loader2, UploadCloud } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type Props = {
    onImported?: () => void;
};

type IngestSummary = {
    imported: number;
    updated?: number;
    foreignAutofatture?: number;
    matchedFineco: number;
    skippedDuplicates: number;
    totalCents: number;
    warnings: string[];
};

export default function ForeignAutofattureUploadBox({ onImported }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<IngestSummary | null>(null);

    const [vendorName, setVendorName] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
    const [eurAmount, setEurAmount] = useState('');
    const [autofatturaType, setAutofatturaType] = useState<'TD17' | 'TD18' | 'TD19'>('TD17');
    const [countryCode, setCountryCode] = useState('US');
    const [jurisdiction, setJurisdiction] = useState<'UE' | 'EXTRA_UE'>('EXTRA_UE');

    const upload = async (file: File) => {
        setUploading(true);
        setError(null);
        setMessage(null);
        setSummary(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const lower = file.name.toLowerCase();
            const needsMeta = /\.(pdf|png|jpe?g|webp)$/i.test(lower);
            if (needsMeta) {
                form.append('vendorName', vendorName.trim() || file.name.replace(/\.[^.]+$/, ''));
                form.append('invoiceDate', invoiceDate);
                form.append('eurAmount', eurAmount);
                form.append('originalAmount', eurAmount);
                form.append('originalCurrency', 'EUR');
                form.append('autofatturaType', autofatturaType);
                form.append('countryCode', countryCode);
                form.append('jurisdiction', jurisdiction);
            }
            const res = await fetch('/api/dashboard/finance/invoices/upload-foreign', {
                method: 'POST',
                body: form,
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                message?: string;
                summary?: IngestSummary;
            }>(res);
            if (!parsed.ok) {
                throw new Error(parsed.error || parsed.data?.message || 'Upload fallito');
            }
            setMessage(parsed.data?.message || 'Import completato');
            setSummary(parsed.data?.summary || null);
            onImported?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload fallito');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="bg-white border border-indigo-100 rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-2xl bg-indigo-50 p-2.5 text-indigo-700">
                    <Globe2 size={20} />
                </div>
                <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-700">
                        Autofatture Estere &amp; Servizi SaaS (TD17/TD18/TD19)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        XML/ZIP SDI riconosciuti automaticamente (TD17 integrazione servizi esteri, TD18
                        beni UE, TD19 art.17 c.2). PDF originali Vercel/Google/Stripe/Meta/OpenAI/AWS:
                        compila i campi sotto.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input
                    type="text"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="Fornitore (PDF)"
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                />
                <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                />
                <input
                    type="text"
                    value={eurAmount}
                    onChange={(e) => setEurAmount(e.target.value)}
                    placeholder="Importo EUR (PDF)"
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                />
                <select
                    value={autofatturaType}
                    onChange={(e) =>
                        setAutofatturaType(e.target.value as 'TD17' | 'TD18' | 'TD19')
                    }
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                >
                    <option value="TD17">TD17 — Servizi estero</option>
                    <option value="TD18">TD18 — Beni UE</option>
                    <option value="TD19">TD19 — Art.17 c.2</option>
                </select>
                <input
                    type="text"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="Paese"
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                    maxLength={2}
                />
                <select
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value as 'UE' | 'EXTRA_UE')}
                    className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                >
                    <option value="EXTRA_UE">Extra-UE</option>
                    <option value="UE">UE</option>
                </select>
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
                className={`rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                    dragOver
                        ? 'border-indigo-400 bg-indigo-50/60'
                        : 'border-indigo-100 bg-indigo-50/20'
                }`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".zip,.xml,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(f);
                    }}
                />
                <button
                    type="button"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                >
                    {uploading ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <UploadCloud size={14} />
                    )}
                    Carica XML / ZIP / PDF
                </button>
                <p className="text-[10px] text-slate-400 mt-2">
                    Reverse charge · categoria SaaS/Hosting · match Fineco automatico
                </p>
            </div>

            {message && (
                <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                    {message}
                </p>
            )}
            {error && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    {error}
                </p>
            )}
            {summary && (
                <p className="text-[10px] text-slate-500">
                    Estere riconosciute: {summary.foreignAutofatture ?? 0} · Fineco:{' '}
                    {summary.matchedFineco} · duplicati: {summary.skippedDuplicates}
                </p>
            )}
        </div>
    );
}
