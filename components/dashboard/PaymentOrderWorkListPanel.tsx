'use client';

/**
 * Lista di lavoro C11 — pagamenti senza ordine / ordini senza pagamento.
 * Proposte stesso importo ±7 giorni; collegamento solo con pulsante Accetta.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Link2 } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type Proposal = {
    orderId: string;
    orderNumber: string | null;
    orderDate: string;
    amountCents: number;
    dayDelta: number;
};

type PaymentRow = {
    transactionId: string;
    date: string;
    channel: string;
    amountCents: number;
    proposals: Proposal[];
};

type OrderRow = {
    orderId: string;
    orderNumber: string | null;
    date: string;
    amountCents: number;
};

type WorkListData = {
    title: string;
    year: number;
    paymentsWithoutOrder: PaymentRow[];
    ordersWithoutPayment: OrderRow[];
    plausiblePairCount: number;
    paymentsTotalCents: number;
    ordersTotalCents: number;
};

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function PaymentOrderWorkListPanel() {
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [data, setData] = useState<WorkListData | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const year = new Date().getFullYear();
            const res = await fetch(
                `/api/dashboard/finance/payment-order-work-list?year=${year}`,
                { cache: 'no-store' }
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                data?: WorkListData;
            }>(res);
            if (!parsed.ok || !parsed.data?.data) {
                throw new Error(parsed.error || parsed.data?.error || 'Caricamento fallito');
            }
            setData(parsed.data.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function accept(payment: PaymentRow, proposal: Proposal) {
        const key = `${payment.transactionId}:${proposal.orderId}`;
        setAccepting(key);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/payment-order-work-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionId: payment.transactionId,
                    channel: payment.channel,
                    orderId: proposal.orderId,
                }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                linkedVia?: string;
                error?: string;
            }>(res);
            if (!parsed.ok || !parsed.data?.ok) {
                throw new Error(parsed.error || parsed.data?.error || 'Collegamento rifiutato');
            }
            setMessage(
                `Collegato ${payment.transactionId.slice(0, 18)}… → ${proposal.orderNumber || proposal.orderId.slice(0, 8)} (${parsed.data.linkedVia || 'ok'})`
            );
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore accept');
        } finally {
            setAccepting(null);
        }
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                <div>
                    <h3 className="text-sm font-bold text-slate-900">
                        C11 — Pagamenti ↔ ordini da collegare
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        Lista di lavoro (non semaforo). Ancorata al pagamento gateway. Nessun
                        collegamento automatico.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Aggiorna
                </button>
            </div>

            {error && (
                <div className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                    {error}
                </div>
            )}
            {message && (
                <div className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    {message}
                </div>
            )}

            {loading && !data ? (
                <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-sm">
                    <Loader2 className="animate-spin" size={18} /> Caricamento…
                </div>
            ) : data ? (
                <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
                        <span className="rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1 font-semibold">
                            Pagamenti senza ordine: {data.paymentsWithoutOrder.length} · €
                            {euro(data.paymentsTotalCents)}
                        </span>
                        <span className="rounded-lg bg-sky-50 border border-sky-100 px-2.5 py-1 font-semibold">
                            Ordini senza pagamento: {data.ordersWithoutPayment.length} · €
                            {euro(data.ordersTotalCents)}
                        </span>
                        <span className="rounded-lg bg-violet-50 border border-violet-100 px-2.5 py-1 font-semibold">
                            Proposte ±7gg: {data.plausiblePairCount}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {/* Pagamenti */}
                        <div className="rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-3 py-2 bg-amber-50/80 border-b border-amber-100 text-xs font-bold text-amber-950">
                                Pagamenti senza ordine
                            </div>
                            <div className="dashboard-table-scroll max-h-[420px] overflow-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-white border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400">
                                        <tr>
                                            <th className="px-2 py-2">Data</th>
                                            <th className="px-2 py-2">Canale / TX</th>
                                            <th className="px-2 py-2 text-right">Importo</th>
                                            <th className="px-2 py-2">Proposta</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.paymentsWithoutOrder.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                                                    Nessun pagamento orfano
                                                </td>
                                            </tr>
                                        ) : (
                                            data.paymentsWithoutOrder.map((p) => (
                                                <tr
                                                    key={p.transactionId}
                                                    className="border-b border-slate-50 align-top"
                                                >
                                                    <td className="px-2 py-2 whitespace-nowrap font-mono">
                                                        {p.date}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <div className="font-semibold text-slate-800">
                                                            {p.channel}
                                                        </div>
                                                        <div
                                                            className="font-mono text-[10px] text-slate-500 break-all"
                                                            title={p.transactionId}
                                                        >
                                                            {p.transactionId}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2 text-right font-mono font-semibold">
                                                        €{euro(p.amountCents)}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        {p.proposals.length === 0 ? (
                                                            <span className="text-slate-400">—</span>
                                                        ) : (
                                                            <ul className="space-y-1.5">
                                                                {p.proposals.map((pr) => {
                                                                    const key = `${p.transactionId}:${pr.orderId}`;
                                                                    return (
                                                                        <li
                                                                            key={pr.orderId}
                                                                            className="flex flex-wrap items-center gap-1.5"
                                                                        >
                                                                            <span className="font-mono text-[10px]">
                                                                                {pr.orderNumber ||
                                                                                    pr.orderId.slice(0, 8)}{' '}
                                                                                · {pr.orderDate} · Δ
                                                                                {pr.dayDelta}g
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                disabled={accepting === key}
                                                                                onClick={() =>
                                                                                    void accept(p, pr)
                                                                                }
                                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-50"
                                                                            >
                                                                                {accepting === key ? (
                                                                                    <Loader2
                                                                                        size={10}
                                                                                        className="animate-spin"
                                                                                    />
                                                                                ) : (
                                                                                    <Link2 size={10} />
                                                                                )}
                                                                                Accetta
                                                                            </button>
                                                                        </li>
                                                                    );
                                                                })}
                                                            </ul>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Ordini */}
                        <div className="rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-3 py-2 bg-sky-50/80 border-b border-sky-100 text-xs font-bold text-sky-950">
                                Ordini senza pagamento
                            </div>
                            <div className="dashboard-table-scroll max-h-[420px] overflow-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-white border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400">
                                        <tr>
                                            <th className="px-2 py-2">Rif.</th>
                                            <th className="px-2 py-2">Data</th>
                                            <th className="px-2 py-2 text-right">Importo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.ordersWithoutPayment.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                                                    Nessun ordine orfano
                                                </td>
                                            </tr>
                                        ) : (
                                            data.ordersWithoutPayment.map((o) => (
                                                <tr
                                                    key={o.orderId}
                                                    className="border-b border-slate-50"
                                                >
                                                    <td className="px-2 py-2 font-mono font-semibold">
                                                        {o.orderNumber || o.orderId.slice(0, 10)}
                                                    </td>
                                                    <td className="px-2 py-2 font-mono">{o.date}</td>
                                                    <td className="px-2 py-2 text-right font-mono">
                                                        €{euro(o.amountCents)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
