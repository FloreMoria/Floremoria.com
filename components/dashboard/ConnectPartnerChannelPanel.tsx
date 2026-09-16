'use client';

/**
 * Quarto canale gateway: Stripe Connect – partner.
 * Inserimento manuale (stessi campi della futura sync) finché non c’è lettura API sull’account connesso.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, Plus, RefreshCw } from 'lucide-react';

type Master = { id: string; shopName: string; uniqueCode: string | null };
type Charge = {
    id: string;
    orderNumber: string;
    masterPartnerName: string;
    accountingDate: string;
    grossCents: number;
    partnerFeeCents: number;
    partnerFeeTaxableCents: number;
    partnerFeeVatCents: number;
    stripeFeeCents: number;
    netCents: number;
    payoutStatus: string;
    source: string;
    notes: string | null;
};
type Summary = {
    channel: string;
    chargeCount: number;
    grossCents: number;
    partnerFeeCents: number;
    stripeFeeCents: number;
    netExpectedCents: number;
    pendingPayoutCents: number;
    accessMode: string;
};

function euro(cents: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export default function ConnectPartnerChannelPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [charges, setCharges] = useState<Charge[]>([]);
    const [masters, setMasters] = useState<Master[]>([]);
    const [form, setForm] = useState({
        masterPartnerId: '',
        orderNumber: '',
        accountingDate: new Date().toISOString().slice(0, 10),
        grossEuro: '',
        partnerFeeEuro: '',
        stripeFeeEuro: '',
        notes: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch('/api/dashboard/finance/connect-partner');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Errore lettura');
            setSummary(data.summary);
            setCharges(data.charges || []);
            setMasters(data.masters || []);
            if (!form.masterPartnerId && data.masters?.[0]?.id) {
                setForm((f) => ({ ...f, masterPartnerId: data.masters[0].id }));
            }
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [form.masterPartnerId]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submit = async () => {
        setSaving(true);
        setMsg(null);
        setErr(null);
        try {
            const grossCents = Math.round(parseFloat(form.grossEuro.replace(',', '.')) * 100);
            const partnerFeeCents = Math.round(parseFloat(form.partnerFeeEuro.replace(',', '.')) * 100);
            const stripeFeeCents = Math.round(parseFloat(form.stripeFeeEuro.replace(',', '.')) * 100);
            if (!Number.isFinite(grossCents) || !Number.isFinite(partnerFeeCents) || !Number.isFinite(stripeFeeCents)) {
                throw new Error('Importi non validi');
            }
            const taxable = Math.round(partnerFeeCents / 1.22);
            const vat = partnerFeeCents - taxable;
            const res = await fetch('/api/dashboard/finance/connect-partner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterPartnerId: form.masterPartnerId,
                    orderNumber: form.orderNumber.trim(),
                    accountingDate: form.accountingDate,
                    grossCents,
                    partnerFeeCents,
                    partnerFeeTaxableCents: taxable,
                    partnerFeeVatCents: vat,
                    stripeFeeCents,
                    notes: form.notes || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
            setMsg(
                `OK ${form.orderNumber}: netto atteso Fineco ${euro(data.netCents)} · ledger +${data.ledger?.inserted ?? 0}`
            );
            setForm((f) => ({ ...f, orderNumber: '', grossEuro: '', partnerFeeEuro: '', stripeFeeEuro: '', notes: '' }));
            await load();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                    <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Link2 size={18} className="text-[#c5a880]" />
                        Stripe Connect – partner
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Quarto canale: account connesso FloreMoria in piattaforma Annunci Funebri.
                        Corrispettivo = lordo cliente; fee partner (IVA 22%) e fee Stripe distinte;
                        bonifico Fineco = trasferimento atteso. Oggi: inserimento manuale (stessi campi
                        della sync futura).
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-lg">
                        {summary?.accessMode === 'api' ? 'API' : 'Manuale'}
                    </span>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
                    >
                        <RefreshCw size={12} /> Aggiorna
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
                    <Loader2 className="animate-spin" size={16} /> Caricamento…
                </div>
            ) : (
                <>
                    {summary && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[
                                ['Corrispettivi', summary.grossCents],
                                ['Fee partner', summary.partnerFeeCents],
                                ['Fee Stripe', summary.stripeFeeCents],
                                ['Netto atteso', summary.netExpectedCents],
                                ['In attesa bonifico', summary.pendingPayoutCents],
                            ].map(([label, cents]) => (
                                <div key={String(label)} className="bg-slate-50 rounded-xl p-3">
                                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                                        {label}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                                        {euro(Number(cents))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="rounded-xl border border-dashed border-[#c5a880]/40 bg-[#faf8f4] p-4 space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-[#8b6914]">
                            Registra incasso Connect (manuale)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <label className="text-xs space-y-1">
                                <span className="text-slate-500 font-semibold">Master partner</span>
                                <select
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
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
                                <span className="text-slate-500 font-semibold">Ordine</span>
                                <input
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-mono"
                                    placeholder="FF-VE-26-001"
                                    value={form.orderNumber}
                                    onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
                                />
                            </label>
                            <label className="text-xs space-y-1">
                                <span className="text-slate-500 font-semibold">Data</span>
                                <input
                                    type="date"
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                                    value={form.accountingDate}
                                    onChange={(e) => setForm({ ...form, accountingDate: e.target.value })}
                                />
                            </label>
                            <label className="text-xs space-y-1">
                                <span className="text-slate-500 font-semibold">Lordo cliente €</span>
                                <input
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-mono"
                                    placeholder="89,99"
                                    value={form.grossEuro}
                                    onChange={(e) => setForm({ ...form, grossEuro: e.target.value })}
                                />
                            </label>
                            <label className="text-xs space-y-1">
                                <span className="text-slate-500 font-semibold">Fee partner € (IVA 22% inclusa)</span>
                                <input
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-mono"
                                    placeholder="9,00"
                                    value={form.partnerFeeEuro}
                                    onChange={(e) => setForm({ ...form, partnerFeeEuro: e.target.value })}
                                />
                            </label>
                            <label className="text-xs space-y-1">
                                <span className="text-slate-500 font-semibold">Fee Stripe €</span>
                                <input
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-mono"
                                    placeholder="3,58"
                                    value={form.stripeFeeEuro}
                                    onChange={(e) => setForm({ ...form, stripeFeeEuro: e.target.value })}
                                />
                            </label>
                        </div>
                        <label className="text-xs space-y-1 block">
                            <span className="text-slate-500 font-semibold">Note</span>
                            <input
                                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            />
                        </label>
                        <button
                            type="button"
                            disabled={saving || !form.orderNumber || !form.masterPartnerId}
                            onClick={() => void submit()}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#8b6914] text-white text-xs font-bold disabled:opacity-50"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Registra tre gambe + trasferimento atteso
                        </button>
                        {msg && <p className="text-xs text-emerald-700 font-medium">{msg}</p>}
                        {err && <p className="text-xs text-rose-600 font-medium">{err}</p>}
                    </div>

                    <div className="dashboard-table-scroll overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[720px]">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                                    <th className="px-3 py-2">Data</th>
                                    <th className="px-3 py-2">Ordine</th>
                                    <th className="px-3 py-2">Master</th>
                                    <th className="px-3 py-2 text-right">Lordo</th>
                                    <th className="px-3 py-2 text-right">Fee partner</th>
                                    <th className="px-3 py-2 text-right">Fee Stripe</th>
                                    <th className="px-3 py-2 text-right">Netto Fineco</th>
                                    <th className="px-3 py-2">Payout</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {charges.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-3 py-8 text-center text-slate-400 italic">
                                            Nessun movimento Connect ancora. Registra FF-VE-26-001 o attendi sync API.
                                        </td>
                                    </tr>
                                ) : (
                                    charges.map((c) => (
                                        <tr key={c.id} className="hover:bg-slate-50/60">
                                            <td className="px-3 py-2 font-mono text-xs">{c.accountingDate}</td>
                                            <td className="px-3 py-2 font-mono text-xs font-semibold">{c.orderNumber}</td>
                                            <td className="px-3 py-2 text-xs">{c.masterPartnerName}</td>
                                            <td className="px-3 py-2 text-right font-mono">{euro(c.grossCents)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-amber-800">
                                                {euro(c.partnerFeeCents)}
                                                <span className="block text-[10px] text-slate-400">
                                                    imp. {euro(c.partnerFeeTaxableCents)} + IVA{' '}
                                                    {euro(c.partnerFeeVatCents)}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">{euro(c.stripeFeeCents)}</td>
                                            <td className="px-3 py-2 text-right font-mono font-semibold">
                                                {euro(c.netCents)}
                                            </td>
                                            <td className="px-3 py-2 text-[10px] uppercase font-bold text-violet-700">
                                                {c.payoutStatus}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
