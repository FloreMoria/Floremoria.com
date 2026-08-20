'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type Props = {
    open: boolean;
    onClose: () => void;
    onSaved?: () => void;
};

export default function ManualExpenseModal({ open, onClose, onSaved }: Props) {
    const now = new Date().toISOString().slice(0, 10);
    const [expenseDate, setExpenseDate] = useState(now);
    const [docType, setDocType] = useState('FATTURA');
    const [vendorName, setVendorName] = useState('');
    const [description, setDescription] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [vatRate, setVatRate] = useState('22');
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('expenseDate', expenseDate);
            form.append('docType', docType);
            form.append('vendorName', vendorName);
            form.append('description', description);
            form.append('totalAmount', totalAmount);
            form.append('vatRate', vatRate);
            if (file) form.append('file', file);
            const res = await fetch('/api/dashboard/finance/manual-expenses', {
                method: 'POST',
                body: form,
            });
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Salvataggio fallito');
            setVendorName('');
            setDescription('');
            setTotalAmount('');
            setFile(null);
            onSaved?.();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore salvataggio');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <h3 className="text-lg font-display font-bold text-slate-900">
                            Registra Spesa / Documento Manuale
                        </h3>
                        <p className="text-xs text-slate-500">
                            Fatture, scontrini e ricevute concorrono a uscite e riconciliazione Fineco.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={submit} className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Data</label>
                        <input
                            required
                            type="date"
                            value={expenseDate}
                            onChange={(e) => setExpenseDate(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Tipo</label>
                        <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        >
                            <option value="FATTURA">Fattura Ricevuta</option>
                            <option value="SCONTRINO">Scontrino</option>
                            <option value="RICEVUTA">Ricevuta</option>
                        </select>
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Fornitore / Beneficiario
                        </label>
                        <input
                            required
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Es. Vercel Inc., Tabaccheria, ..."
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Descrizione / Causale
                        </label>
                        <input
                            required
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Importo Totale €
                        </label>
                        <input
                            required
                            value={totalAmount}
                            onChange={(e) => setTotalAmount(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                            placeholder="0,00"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            IVA / Aliquota %
                        </label>
                        <select
                            value={vatRate}
                            onChange={(e) => setVatRate(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        >
                            <option value="0">0% (esente / estero)</option>
                            <option value="4">4%</option>
                            <option value="10">10%</option>
                            <option value="22">22%</option>
                        </select>
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Allegato PDF / Foto
                        </label>
                        <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="w-full text-sm"
                        />
                    </div>
                    {error && (
                        <p className="sm:col-span-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                            {error}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={saving}
                        className="sm:col-span-2 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                        {saving ? 'Salvataggio…' : 'Registra spesa'}
                    </button>
                </form>
            </div>
        </div>
    );
}
