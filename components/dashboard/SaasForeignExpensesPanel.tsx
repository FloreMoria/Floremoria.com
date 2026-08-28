'use client';

/**
 * Upload + archivio fatture SaaS / estere con export ZIP mensile.
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, FileUp, Loader2, Trash2, X } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type SaasInvoice = {
    id: string;
    invoiceDate: string;
    vendorName: string;
    originalCurrency: string;
    originalAmountCents: number;
    eurAmountCents: number;
    countryCode: string | null;
    jurisdiction: string;
    autofatturaType: string;
    fileName: string;
    periodKey: string;
};

type Props = {
    open: boolean;
    onClose: () => void;
    onTotalsChange?: (totalEurCents: number) => void;
};

const euro = (cents: number) => (cents / 100).toFixed(2);

export default function SaasForeignExpensesPanel({ open, onClose, onTotalsChange }: Props) {
    const now = new Date();
    const [invoices, setInvoices] = useState<SaasInvoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [zipYear, setZipYear] = useState(now.getFullYear());
    const [zipMonth, setZipMonth] = useState(now.getMonth() + 1);

    const [vendorName, setVendorName] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(now.toISOString().slice(0, 10));
    const [originalCurrency, setOriginalCurrency] = useState('EUR');
    const [originalAmount, setOriginalAmount] = useState('');
    const [eurAmount, setEurAmount] = useState('');
    const [countryCode, setCountryCode] = useState('US');
    const [jurisdiction, setJurisdiction] = useState<'UE' | 'EXTRA_UE'>('EXTRA_UE');
    const [autofatturaType, setAutofatturaType] = useState<'NONE' | 'TD17' | 'TD18' | 'TD19'>('TD17');
    const [file, setFile] = useState<File | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/saas-invoices');
            const parsed = await readJsonResponse<{
                ok?: boolean;
                invoices?: SaasInvoice[];
                totalEurCents?: number;
                error?: string;
            }>(res);
            if (!parsed.ok || !parsed.data) {
                throw new Error(parsed.error || 'Caricamento fallito');
            }
            setInvoices(parsed.data.invoices || []);
            onTotalsChange?.(parsed.data.totalEurCents || 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento');
        } finally {
            setLoading(false);
        }
    }, [onTotalsChange]);

    useEffect(() => {
        if (open) void load();
    }, [open, load]);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Seleziona un documento (PDF/XML/immagine).');
            return;
        }
        setUploading(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('vendorName', vendorName);
            form.append('invoiceDate', invoiceDate);
            form.append('originalCurrency', originalCurrency);
            form.append('originalAmount', originalAmount);
            if (eurAmount) form.append('eurAmount', eurAmount);
            form.append('countryCode', countryCode);
            form.append('jurisdiction', jurisdiction);
            form.append('autofatturaType', autofatturaType);
            const res = await fetch('/api/dashboard/finance/saas-invoices/upload', {
                method: 'POST',
                body: form,
            });
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Upload fallito');
            setFile(null);
            setOriginalAmount('');
            setEurAmount('');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload fallito');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Eliminare questa fattura SaaS?')) return;
        const res = await fetch(`/api/dashboard/finance/saas-invoices/${id}`, { method: 'DELETE' });
        const parsed = await readJsonResponse(res);
        if (!parsed.ok) {
            setError(parsed.error || 'Eliminazione fallita');
            return;
        }
        await load();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
            <button type="button" className="flex-1 cursor-default" aria-label="Chiudi" onClick={onClose} />
            <aside className="w-full max-w-3xl h-full bg-white shadow-2xl overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-display font-bold text-slate-900">Spese SaaS / Estere</h3>
                        <p className="text-xs text-slate-500">
                            Fatture passive estere, autofattura TD17/TD18/TD19 ed export ZIP per il commercialista.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-6">
                    <form
                        onSubmit={handleUpload}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-4"
                    >
                        <div className="sm:col-span-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                            Upload fattura estera
                        </div>
                        <input
                            required
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                            placeholder="Fornitore (Vercel, OpenAI, Google…)"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                        <input
                            required
                            type="date"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                        <input
                            value={originalCurrency}
                            onChange={(e) => setOriginalCurrency(e.target.value.toUpperCase())}
                            placeholder="Valuta"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                        <input
                            required
                            value={originalAmount}
                            onChange={(e) => setOriginalAmount(e.target.value)}
                            placeholder="Importo originale"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                        />
                        <input
                            value={eurAmount}
                            onChange={(e) => setEurAmount(e.target.value)}
                            placeholder="Importo € (se diverso)"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                        />
                        <input
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                            placeholder="Paese (US, IE…)"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                        <select
                            value={jurisdiction}
                            onChange={(e) => setJurisdiction(e.target.value as 'UE' | 'EXTRA_UE')}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                            <option value="EXTRA_UE">Extra-UE</option>
                            <option value="UE">UE</option>
                        </select>
                        <select
                            value={autofatturaType}
                            onChange={(e) =>
                                setAutofatturaType(e.target.value as 'NONE' | 'TD17' | 'TD18' | 'TD19')
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                            <option value="TD17">Autofattura TD17</option>
                            <option value="TD18">Autofattura TD18</option>
                            <option value="TD19">Autofattura TD19</option>
                            <option value="NONE">Nessuna</option>
                        </select>
                        <input
                            type="file"
                            accept=".pdf,.xml,.png,.jpg,.jpeg,.webp"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="sm:col-span-2 text-sm"
                        />
                        <button
                            type="submit"
                            disabled={uploading}
                            className="sm:col-span-2 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                        >
                            {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                            {uploading ? 'Caricamento…' : 'Carica fattura'}
                        </button>
                    </form>

                    <div className="flex flex-wrap items-end gap-3 bg-blue-50/60 border border-blue-100 rounded-2xl p-4">
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Anno</label>
                            <input
                                type="number"
                                value={zipYear}
                                onChange={(e) => setZipYear(Number(e.target.value))}
                                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Mese</label>
                            <select
                                value={zipMonth}
                                onChange={(e) => setZipMonth(Number(e.target.value))}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                    <option key={m} value={m}>
                                        {String(m).padStart(2, '0')}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <a
                            href={`/api/dashboard/finance/saas-invoices/download-zip?year=${zipYear}&month=${zipMonth}`}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider"
                        >
                            <Download size={14} />
                            Scarica ZIP Fatture Estere (Mese)
                        </a>
                    </div>

                    {error && (
                        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                            {error}
                        </p>
                    )}

                    <div className="dashboard-table-scroll overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 text-left">
                                    <th className="px-3 py-2">Data</th>
                                    <th className="px-3 py-2">Fornitore</th>
                                    <th className="px-3 py-2">Importo</th>
                                    <th className="px-3 py-2">Paese</th>
                                    <th className="px-3 py-2">Autofattura</th>
                                    <th className="px-3 py-2">PDF</th>
                                    <th className="px-3 py-2 text-right">Azioni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                                            <Loader2 className="inline animate-spin mr-2" size={14} />
                                            Caricamento…
                                        </td>
                                    </tr>
                                ) : invoices.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-6 text-center text-slate-400 text-xs">
                                            Nessuna fattura SaaS caricata.
                                        </td>
                                    </tr>
                                ) : (
                                    invoices.map((inv) => (
                                        <tr key={inv.id} className="border-t border-slate-100">
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {inv.invoiceDate.slice(0, 10)}
                                            </td>
                                            <td className="px-3 py-2 font-medium text-slate-800">
                                                {inv.vendorName}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs">
                                                {inv.originalCurrency}{' '}
                                                {euro(inv.originalAmountCents)}
                                                {inv.originalCurrency !== 'EUR' && (
                                                    <span className="text-slate-400">
                                                        {' '}
                                                        / €{euro(inv.eurAmountCents)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                                {inv.countryCode || '—'} · {inv.jurisdiction}
                                            </td>
                                            <td className="px-3 py-2 text-xs font-semibold">
                                                <span
                                                    className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                        inv.autofatturaType !== 'NONE'
                                                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                                            : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                >
                                                    {inv.autofatturaType !== 'NONE'
                                                        ? `Autofattura Estera (${inv.autofatturaType})`
                                                        : inv.autofatturaType}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <a
                                                    href={`/api/dashboard/finance/saas-invoices/${inv.id}`}
                                                    className="text-blue-600 hover:underline text-xs"
                                                >
                                                    {inv.fileName}
                                                </a>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDelete(inv.id)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 text-rose-700 text-xs"
                                                >
                                                    <Trash2 size={12} />
                                                    Elimina
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </aside>
        </div>
    );
}
