'use client';

/**
 * Alert Contabilità: fioristi pagati senza fattura + Associa ordine.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    Link2,
    Loader2,
    Mail,
    MessageCircle,
    RefreshCw,
    Search,
    X,
} from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { formatFinanceDate } from '@/lib/financial/formatFinanceDate';

export type FloristMissingInvoiceRow = {
    id: string;
    partnerId: string | null;
    partnerName: string;
    partnerVat: string | null;
    partnerEmail: string | null;
    partnerWhatsapp: string | null;
    paymentDate: string;
    amountCents: number;
    daysSincePayment: number;
    bankLineId: string | null;
    documentId: string | null;
    orderId: string | null;
    orderNumber: string | null;
    orderMatchSource?: 'manual' | 'auto' | null;
    description: string;
    severity: 'warning' | 'critical';
    statusLabel: string;
};

type OrderHit = {
    id: string;
    orderNumber: string | null;
    buyerFullName?: string | null;
    totalPriceCents?: number | null;
    partner?: { shopName?: string | null } | null;
};

type Props = {
    onLinkInvoice?: (prefill: {
        vendorName: string;
        totalEuro: string;
        expenseDate: string;
        notes?: string;
    }) => void;
};

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatOrderRef(row: FloristMissingInvoiceRow): string | null {
    if (row.orderNumber) {
        const n = row.orderNumber.trim();
        return n.startsWith('#') || /^ORD/i.test(n) ? n : `#${n}`;
    }
    if (row.orderId) return `#${row.orderId.slice(0, 10)}…`;
    return null;
}

export default function FloristMissingInvoicesPanel({ onLinkInvoice }: Props) {
    const [rows, setRows] = useState<FloristMissingInvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);

    const [linkRow, setLinkRow] = useState<FloristMissingInvoiceRow | null>(null);
    const [orderQuery, setOrderQuery] = useState('');
    const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
    const [searchingOrders, setSearchingOrders] = useState(false);
    const [linking, setLinking] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/florist-missing-invoices');
            const parsed = await readJsonResponse<{
                ok?: boolean;
                rows?: FloristMissingInvoiceRow[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Caricamento fallito');
            setRows(parsed.data?.rows || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!linkRow) return;
        const q = orderQuery.trim();
        if (q.length < 2) {
            setOrderHits([]);
            return;
        }
        const t = setTimeout(async () => {
            setSearchingOrders(true);
            try {
                const res = await fetch(
                    `/api/dashboard/orders/search?q=${encodeURIComponent(q)}&limit=20`
                );
                const parsed = await readJsonResponse<{
                    ok?: boolean;
                    orders?: OrderHit[];
                    results?: OrderHit[];
                }>(res);
                const list = parsed.data?.orders || parsed.data?.results || [];
                setOrderHits(Array.isArray(list) ? list : []);
            } catch {
                setOrderHits([]);
            } finally {
                setSearchingOrders(false);
            }
        }, 280);
        return () => clearTimeout(t);
    }, [orderQuery, linkRow]);

    const remind = async (
        row: FloristMissingInvoiceRow,
        channel: 'email' | 'whatsapp' | 'both'
    ) => {
        setBusyId(`${row.id}-${channel}`);
        setFlash(null);
        try {
            const res = await fetch('/api/dashboard/finance/florist-missing-invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'remind',
                    channel,
                    rowId: row.id,
                    partnerId: row.partnerId,
                    partnerEmail: row.partnerEmail,
                    partnerWhatsapp: row.partnerWhatsapp,
                    partnerName: row.partnerName,
                    amountCents: row.amountCents,
                    paymentDate: row.paymentDate,
                    daysSincePayment: row.daysSincePayment,
                    orderNumber: row.orderNumber,
                }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                message?: string;
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Sollecito fallito');
            setFlash(parsed.data?.message || 'Sollecito inviato');
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Sollecito fallito');
        } finally {
            setBusyId(null);
        }
    };

    const associateOrder = async (order: OrderHit) => {
        if (!linkRow?.bankLineId || !linkRow.documentId) {
            setFlash('Questa riga non è collegata a un movimento bancario abbinabile.');
            return;
        }
        setLinking(true);
        setFlash(null);
        try {
            const res = await fetch('/api/dashboard/finance/florist-missing-invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'link_order',
                    bankLineId: linkRow.bankLineId,
                    documentId: linkRow.documentId,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                message?: string;
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Associazione fallita');
            setFlash(parsed.data?.message || `Ordine ${order.orderNumber || order.id} associato`);
            setLinkRow(null);
            setOrderQuery('');
            setOrderHits([]);
            await load();
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Associazione fallita');
        } finally {
            setLinking(false);
        }
    };

    const critical = rows.filter((r) => r.severity === 'critical').length;

    return (
        <div className="space-y-3">
            {rows.length > 0 && (
                <div
                    className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${
                        critical > 0
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                >
                    <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                    <div className="text-sm">
                        <p className="font-semibold">Fatture in attesa dai fioristi</p>
                        <p className="text-xs mt-0.5 opacity-90">
                            {rows.length} bonifici/compensi senza fattura ricevuta entro 15 giorni
                            {critical > 0 ? ` · ${critical} oltre soglia critica (≥15 gg)` : ''}.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="ml-auto p-2 rounded-xl hover:bg-white/50 text-inherit"
                        title="Aggiorna"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            )}

            {flash && (
                <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700">
                    {flash}
                </div>
            )}
            {error && (
                <div className="text-xs bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 text-rose-700">
                    {error}
                </div>
            )}

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                    <Loader2 className="animate-spin" size={16} />
                    Analisi pagamenti fioristi…
                </div>
            ) : rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                    Nessuna fattura in attesa dai fioristi. Tutti i pagamenti hanno un match entro
                    15 giorni.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-4 py-3 font-bold">Fiorista & P.IVA</th>
                                <th className="px-4 py-3 font-bold">Ordine</th>
                                <th className="px-4 py-3 font-bold">Data bonifico</th>
                                <th className="px-4 py-3 font-bold text-right">Importo</th>
                                <th className="px-4 py-3 font-bold">Giorni</th>
                                <th className="px-4 py-3 font-bold">Stato</th>
                                <th className="px-4 py-3 font-bold text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((row) => {
                                const orderRef = formatOrderRef(row);
                                return (
                                <tr key={row.id} className="hover:bg-slate-50/80">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-900">{row.partnerName}</p>
                                        <p className="text-[11px] text-slate-500 font-mono">
                                            {row.partnerVat || 'P.IVA n/d'}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3">
                                        {orderRef ? (
                                            <div>
                                                <p className="font-mono text-xs font-semibold text-slate-800">
                                                    {orderRef}
                                                </p>
                                                {row.orderMatchSource === 'auto' && (
                                                    <p className="text-[10px] text-teal-700 font-medium mt-0.5">
                                                        Match automatico
                                                    </p>
                                                )}
                                                {row.orderMatchSource === 'manual' && (
                                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                                        Associato
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-[11px] text-slate-400 italic">
                                                Non associato
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                        {formatFinanceDate(row.paymentDate)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                                        €{euro(row.amountCents)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">{row.daysSincePayment}</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                                row.severity === 'critical'
                                                    ? 'bg-rose-100 text-rose-800'
                                                    : 'bg-amber-100 text-amber-800'
                                            }`}
                                        >
                                            {row.statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                            <button
                                                type="button"
                                                disabled={!!busyId || !row.partnerEmail}
                                                onClick={() => void remind(row, 'email')}
                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-700 hover:bg-white disabled:opacity-40"
                                            >
                                                {busyId === `${row.id}-email` ? (
                                                    <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                    <Mail size={12} />
                                                )}
                                                Email
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!!busyId || !row.partnerWhatsapp}
                                                onClick={() => void remind(row, 'whatsapp')}
                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-700 hover:bg-white disabled:opacity-40"
                                            >
                                                {busyId === `${row.id}-whatsapp` ? (
                                                    <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                    <MessageCircle size={12} />
                                                )}
                                                WhatsApp
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!row.bankLineId || !row.documentId}
                                                onClick={() => {
                                                    setLinkRow(row);
                                                    setOrderQuery('');
                                                    setOrderHits([]);
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#c5a880]/40 bg-[#c5a880]/10 text-[#8a6d45] text-[10px] font-bold uppercase tracking-wide hover:bg-[#c5a880]/20 disabled:opacity-40"
                                            >
                                                <Search size={12} />
                                                Associa ordine
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onLinkInvoice?.({
                                                        vendorName: row.partnerName,
                                                        totalEuro: (row.amountCents / 100).toFixed(2),
                                                        expenseDate: row.paymentDate,
                                                        notes: `Collegamento manuale pagamento ${row.id}`,
                                                    })
                                                }
                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wide hover:bg-slate-800"
                                            >
                                                <Link2 size={12} />
                                                Collega fattura
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {linkRow && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-slate-100">
                        <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-white z-10">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Associa ordine</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {linkRow.partnerName} · €{euro(linkRow.amountCents)} ·{' '}
                                    {formatFinanceDate(linkRow.paymentDate)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setLinkRow(null)}
                                className="p-2 rounded-lg hover:bg-slate-50 text-slate-500"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <label className="block text-[10px] font-bold uppercase text-slate-500">
                                Cerca ordine (numero, cliente, email…)
                                <div className="mt-1 relative">
                                    <Search
                                        size={14}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    />
                                    <input
                                        value={orderQuery}
                                        onChange={(e) => setOrderQuery(e.target.value)}
                                        placeholder="Es. PT-MI-26-001"
                                        className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#c5a880]"
                                        autoFocus
                                    />
                                </div>
                            </label>
                            {searchingOrders && (
                                <p className="text-xs text-slate-400 inline-flex items-center gap-1">
                                    <Loader2 size={12} className="animate-spin" /> Ricerca…
                                </p>
                            )}
                            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-64 overflow-y-auto">
                                {orderHits.length === 0 ? (
                                    <li className="px-3 py-6 text-center text-xs text-slate-400">
                                        {orderQuery.trim().length < 2
                                            ? 'Digita almeno 2 caratteri'
                                            : 'Nessun ordine trovato'}
                                    </li>
                                ) : (
                                    orderHits.map((o) => (
                                        <li key={o.id}>
                                            <button
                                                type="button"
                                                disabled={linking}
                                                onClick={() => void associateOrder(o)}
                                                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 disabled:opacity-50"
                                            >
                                                <p className="text-sm font-semibold text-slate-800 font-mono">
                                                    {o.orderNumber || o.id.slice(0, 10)}
                                                </p>
                                                <p className="text-[11px] text-slate-500 truncate">
                                                    {o.buyerFullName || 'Cliente n/d'}
                                                    {o.partner?.shopName
                                                        ? ` · ${o.partner.shopName}`
                                                        : ''}
                                                    {typeof o.totalPriceCents === 'number'
                                                        ? ` · €${euro(o.totalPriceCents)}`
                                                        : ''}
                                                </p>
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
