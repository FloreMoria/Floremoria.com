'use client';

/**
 * Fatture mensili fee master partner — collegate a PartnerFeeMonthClose / C14.
 * La fattura giustifica la trattenuta Connect: non genera un secondo costo.
 */

import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, RefreshCw } from 'lucide-react';

type CloseRow = {
    id: string;
    masterPartnerId: string;
    masterPartnerName: string;
    yearMonth: string;
    maturedCents: number;
    maturedTaxableCents: number;
    maturedVatCents: number;
    invoiceCents: number | null;
    connectCents: number | null;
    status: string;
    exceptionNote: string | null;
};

type Master = { id: string; shopName: string };

function euro(cents: number | null): string {
    if (cents == null) return '—';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export default function PartnerFeeInvoicesPanel() {
    const [rows, setRows] = useState<CloseRow[]>([]);
    const [masters, setMasters] = useState<Master[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [form, setForm] = useState({
        masterPartnerId: '',
        yearMonth: new Date().toISOString().slice(0, 7),
        invoiceEuro: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/dashboard/finance/partner-fee-invoices');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Errore');
            setRows(data.closes || []);
            setMasters(data.masters || []);
            if (!form.masterPartnerId && data.masters?.[0]?.id) {
                setForm((f) => ({ ...f, masterPartnerId: data.masters[0].id }));
            }
        } catch (e) {
            setMsg(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [form.masterPartnerId]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const invoiceCents = Math.round(parseFloat(form.invoiceEuro.replace(',', '.')) * 100);
            if (!Number.isFinite(invoiceCents)) throw new Error('Importo fattura non valido');
            const res = await fetch('/api/dashboard/finance/partner-fee-invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterPartnerId: form.masterPartnerId,
                    yearMonth: form.yearMonth,
                    invoiceCents,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
            setMsg(`C14 ${data.snapshot?.status} — maturato ${euro(data.snapshot?.maturedCents)}`);
            setForm((f) => ({ ...f, invoiceEuro: '' }));
            await load();
        } catch (e) {
            setMsg(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#c5a880]" />
                    <h4 className="text-sm font-semibold text-slate-800">
                        Fatture fee master partner (C14)
                    </h4>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="text-xs text-slate-500 inline-flex items-center gap-1"
                >
                    <RefreshCw size={12} /> Aggiorna
                </button>
            </div>
            <div className="p-4 space-y-3 border-b border-slate-100 bg-[#faf8f4]/60">
                <p className="text-[11px] text-slate-500">
                    La fattura mensile del master giustifica la trattenuta Connect già registrata
                    come costo all’ordine: non genera un secondo costo. C14 confronta maturato =
                    fattura = trattenute.
                </p>
                <div className="flex flex-wrap gap-2 items-end">
                    <label className="text-xs space-y-1">
                        <span className="text-slate-500 font-semibold">Master</span>
                        <select
                            className="block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                            value={form.masterPartnerId}
                            onChange={(e) => setForm({ ...form, masterPartnerId: e.target.value })}
                        >
                            {masters.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.shopName}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-slate-500 font-semibold">Mese</span>
                        <input
                            type="month"
                            className="block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                            value={form.yearMonth}
                            onChange={(e) => setForm({ ...form, yearMonth: e.target.value })}
                        />
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-slate-500 font-semibold">Importo fattura €</span>
                        <input
                            className="block rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono w-28"
                            placeholder="9,00"
                            value={form.invoiceEuro}
                            onChange={(e) => setForm({ ...form, invoiceEuro: e.target.value })}
                        />
                    </label>
                    <button
                        type="button"
                        disabled={saving || !form.masterPartnerId}
                        onClick={() => void save()}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#8b6914] text-white text-xs font-bold disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                        Registra fattura → C14
                    </button>
                </div>
                {msg && <p className="text-xs text-slate-700">{msg}</p>}
            </div>
            <div className="dashboard-table-scroll overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[560px]">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                            <th className="px-4 py-2">Mese</th>
                            <th className="px-4 py-2">Master</th>
                            <th className="px-4 py-2 text-right">Maturato</th>
                            <th className="px-4 py-2 text-right">Fattura</th>
                            <th className="px-4 py-2 text-right">Connect</th>
                            <th className="px-4 py-2">C14</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                                    <Loader2 className="inline animate-spin mr-2" size={14} />
                                    Caricamento…
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">
                                    Nessuna chiusura fee ancora. Comparirà dopo il primo ordine partner / registrazione.
                                </td>
                            </tr>
                        ) : (
                            rows.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-2 font-mono text-xs">{r.yearMonth}</td>
                                    <td className="px-4 py-2 text-xs">{r.masterPartnerName}</td>
                                    <td className="px-4 py-2 text-right font-mono">{euro(r.maturedCents)}</td>
                                    <td className="px-4 py-2 text-right font-mono">{euro(r.invoiceCents)}</td>
                                    <td className="px-4 py-2 text-right font-mono">{euro(r.connectCents)}</td>
                                    <td className="px-4 py-2 text-[10px] font-bold uppercase text-slate-600">
                                        {r.status}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
