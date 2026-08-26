'use client';

/**
 * Alert Contabilità: fioristi pagati senza fattura + Associa / Modifica / Elimina / scontrino.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    Link2,
    Loader2,
    Mail,
    MessageCircle,
    Paperclip,
    Pencil,
    RefreshCw,
    Search,
    Trash2,
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
    bankPaymentDate?: string | null;
    amountCents: number;
    daysSincePayment: number;
    bankLineId: string | null;
    documentId: string | null;
    orderId: string | null;
    orderNumber: string | null;
    orderCreatedAt?: string | null;
    orderDeliveryDate?: string | null;
    orderMatchSource?: 'manual' | 'auto' | null;
    description: string;
    notes?: string | null;
    receiptUrl?: string | null;
    receiptPath?: string | null;
    linkedExpenseId?: string | null;
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

const API = '/api/dashboard/finance/florist-missing-invoices';

export default function FloristMissingInvoicesPanel({ onLinkInvoice }: Props) {
    const [rows, setRows] = useState<FloristMissingInvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);

    const [linkRow, setLinkRow] = useState<FloristMissingInvoiceRow | null>(null);
    const [editRow, setEditRow] = useState<FloristMissingInvoiceRow | null>(null);
    const [orderQuery, setOrderQuery] = useState('');
    const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
    const [searchingOrders, setSearchingOrders] = useState(false);
    const [linking, setLinking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [editDate, setEditDate] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(API);
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
        if (!linkRow && !editRow) return;
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
    }, [orderQuery, linkRow, editRow]);

    const openEdit = (row: FloristMissingInvoiceRow) => {
        setEditRow(row);
        setEditDate(row.paymentDate);
        setEditAmount((row.amountCents / 100).toFixed(2).replace('.', ','));
        setEditNotes(row.notes || '');
        setOrderQuery(row.orderNumber || '');
        setOrderHits([]);
        setFlash(null);
    };

    const remind = async (
        row: FloristMissingInvoiceRow,
        channel: 'email' | 'whatsapp' | 'both'
    ) => {
        setBusyId(`${row.id}-${channel}`);
        setFlash(null);
        try {
            const res = await fetch(API, {
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

    const associateOrder = async (order: OrderHit, target: FloristMissingInvoiceRow) => {
        setLinking(true);
        setFlash(null);
        try {
            const res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'link_order',
                    rowId: target.id,
                    bankLineId: target.bankLineId,
                    documentId: target.documentId,
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
            setEditRow(null);
            setOrderQuery('');
            setOrderHits([]);
            await load();
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Associazione fallita');
        } finally {
            setLinking(false);
        }
    };

    const saveEdit = async () => {
        if (!editRow) return;
        setSaving(true);
        setFlash(null);
        try {
            const amount = Number(String(editAmount).replace(',', '.'));
            const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
            const res = await fetch(API, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rowId: editRow.id,
                    paymentDate: editDate || undefined,
                    amountCents,
                    notes: editNotes,
                    partnerId: editRow.partnerId,
                    orderId: editRow.orderId,
                }),
            });
            const parsed = await readJsonResponse<{ ok?: boolean; message?: string; error?: string }>(
                res
            );
            if (!parsed.ok) throw new Error(parsed.error || 'Salvataggio fallito');
            setFlash(parsed.data?.message || 'Modifiche salvate');
            setEditRow(null);
            await load();
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Salvataggio fallito');
        } finally {
            setSaving(false);
        }
    };

    const dismissRow = async (row: FloristMissingInvoiceRow) => {
        const ok = window.confirm(
            `Archiviare la riga di ${row.partnerName}` +
                (row.orderNumber ? ` (ordine ${row.orderNumber})` : '') +
                '? Non comparirà più nell’elenco.'
        );
        if (!ok) return;
        setBusyId(`${row.id}-delete`);
        setFlash(null);
        try {
            const res = await fetch(`${API}?rowId=${encodeURIComponent(row.id)}`, {
                method: 'DELETE',
            });
            const parsed = await readJsonResponse<{ ok?: boolean; message?: string; error?: string }>(
                res
            );
            if (!parsed.ok) throw new Error(parsed.error || 'Eliminazione fallita');
            setFlash(parsed.data?.message || 'Riga archiviata');
            await load();
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Eliminazione fallita');
        } finally {
            setBusyId(null);
        }
    };

    const uploadReceipt = async (row: FloristMissingInvoiceRow, file: File) => {
        setUploading(true);
        setFlash(null);
        try {
            const form = new FormData();
            form.set('action', 'upload_receipt');
            form.set('rowId', row.id);
            form.set('file', file);
            const res = await fetch(API, { method: 'POST', body: form });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                message?: string;
                receiptUrl?: string;
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Upload fallito');
            setFlash(parsed.data?.message || 'Scontrino salvato');
            if (editRow?.id === row.id && parsed.data?.receiptUrl) {
                setEditRow({ ...editRow, receiptUrl: parsed.data.receiptUrl });
            }
            await load();
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Upload fallito');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
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
                            {rows.length} bonifici/compensi senza fattura ricevuta
                            {critical > 0 ? ` · ${critical} oltre soglia critica (≥15 gg)` : ''}.
                            Date e giorni calcolati dall’ordine collegato quando presente.
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
                                <th className="px-4 py-3 font-bold">Data rif.</th>
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
                                            <p className="font-medium text-slate-900">
                                                {row.partnerName}
                                            </p>
                                            <p className="text-[11px] text-slate-500 font-mono">
                                                {row.partnerVat || 'P.IVA n/d'}
                                            </p>
                                            {row.receiptUrl && (
                                                <a
                                                    href={row.receiptUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-teal-700 hover:underline"
                                                >
                                                    <Paperclip size={10} /> Scontrino
                                                </a>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {orderRef ? (
                                                <div>
                                                    <p className="font-mono text-xs font-semibold text-slate-800">
                                                        {orderRef}
                                                    </p>
                                                    {row.orderMatchSource === 'auto' && (
                                                        <span className="inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-teal-50 border border-teal-200 text-teal-800">
                                                            Match automatico
                                                        </span>
                                                    )}
                                                    {row.orderMatchSource === 'manual' && (
                                                        <span className="inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-100 border border-slate-200 text-slate-600">
                                                            Associato
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-slate-400 italic">
                                                    Non associato
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                            <div>{formatFinanceDate(row.paymentDate)}</div>
                                            {row.bankPaymentDate &&
                                                row.bankPaymentDate !== row.paymentDate && (
                                                    <div className="text-[10px] text-slate-400">
                                                        bon. {formatFinanceDate(row.bankPaymentDate)}
                                                    </div>
                                                )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                                            €{euro(row.amountCents)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            {row.daysSincePayment}
                                        </td>
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
                                                    title="Modifica"
                                                    onClick={() => openEdit(row)}
                                                    className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-white"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Elimina / archivia"
                                                    disabled={!!busyId}
                                                    onClick={() => void dismissRow(row)}
                                                    className="inline-flex items-center justify-center p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                                                >
                                                    {busyId === `${row.id}-delete` ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : (
                                                        <Trash2 size={14} />
                                                    )}
                                                </button>
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
                                                    disabled={!row.bankLineId}
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
                                                            totalEuro: (row.amountCents / 100).toFixed(
                                                                2
                                                            ),
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
                <OrderSearchModal
                    title="Associa ordine"
                    subtitle={`${linkRow.partnerName} · €${euro(linkRow.amountCents)} · ${formatFinanceDate(linkRow.paymentDate)}`}
                    orderQuery={orderQuery}
                    setOrderQuery={setOrderQuery}
                    orderHits={orderHits}
                    searchingOrders={searchingOrders}
                    linking={linking}
                    onClose={() => setLinkRow(null)}
                    onPick={(o) => void associateOrder(o, linkRow)}
                />
            )}

            {editRow && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-slate-100">
                        <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-white z-10">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Modifica riga</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {editRow.partnerName}
                                    {editRow.orderNumber ? ` · ${editRow.orderNumber}` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditRow(null)}
                                className="p-2 rounded-lg hover:bg-slate-50 text-slate-500"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <label className="block text-[10px] font-bold uppercase text-slate-500">
                                Data riferimento
                                <input
                                    type="date"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#c5a880]"
                                />
                            </label>
                            <label className="block text-[10px] font-bold uppercase text-slate-500">
                                Importo compenso (€)
                                <input
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#c5a880]"
                                />
                            </label>
                            <label className="block text-[10px] font-bold uppercase text-slate-500">
                                Note
                                <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    rows={3}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#c5a880]"
                                />
                            </label>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
                                <p className="text-[10px] font-bold uppercase text-slate-500">
                                    Scontrino / ricevuta
                                </p>
                                {editRow.receiptUrl ? (
                                    <a
                                        href={editRow.receiptUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-teal-700 font-semibold hover:underline inline-flex items-center gap-1"
                                    >
                                        <Paperclip size={12} /> Apri allegato
                                    </a>
                                ) : (
                                    <p className="text-[11px] text-slate-400">Nessun allegato</p>
                                )}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,application/pdf"
                                    className="block w-full text-xs text-slate-600"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void uploadReceipt(editRow, f);
                                    }}
                                />
                                {uploading && (
                                    <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                                        <Loader2 size={12} className="animate-spin" /> Caricamento…
                                    </p>
                                )}
                            </div>

                            {editRow.bankLineId && (
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                                        Cambia ordine associato
                                    </p>
                                    <div className="relative">
                                        <Search
                                            size={14}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                        />
                                        <input
                                            value={orderQuery}
                                            onChange={(e) => setOrderQuery(e.target.value)}
                                            placeholder="Cerca FF-… / FT-…"
                                            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#c5a880]"
                                        />
                                    </div>
                                    {searchingOrders && (
                                        <p className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1">
                                            <Loader2 size={12} className="animate-spin" /> Ricerca…
                                        </p>
                                    )}
                                    <ul className="mt-2 divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-40 overflow-y-auto">
                                        {orderHits.map((o) => (
                                            <li key={o.id}>
                                                <button
                                                    type="button"
                                                    disabled={linking}
                                                    onClick={() => void associateOrder(o, editRow)}
                                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs disabled:opacity-50"
                                                >
                                                    <span className="font-mono font-semibold">
                                                        {o.orderNumber || o.id.slice(0, 10)}
                                                    </span>
                                                    {o.buyerFullName ? ` · ${o.buyerFullName}` : ''}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditRow(null)}
                                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold uppercase text-slate-600"
                                >
                                    Annulla
                                </button>
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void saveEdit()}
                                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                                    Salva
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function OrderSearchModal(props: {
    title: string;
    subtitle: string;
    orderQuery: string;
    setOrderQuery: (v: string) => void;
    orderHits: OrderHit[];
    searchingOrders: boolean;
    linking: boolean;
    onClose: () => void;
    onPick: (o: OrderHit) => void;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
        >
            <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-slate-100">
                <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-white z-10">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">{props.title}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">{props.subtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={props.onClose}
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
                                value={props.orderQuery}
                                onChange={(e) => props.setOrderQuery(e.target.value)}
                                placeholder="Es. FF-VI-26-003"
                                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#c5a880]"
                                autoFocus
                            />
                        </div>
                    </label>
                    {props.searchingOrders && (
                        <p className="text-xs text-slate-400 inline-flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" /> Ricerca…
                        </p>
                    )}
                    <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-64 overflow-y-auto">
                        {props.orderHits.length === 0 ? (
                            <li className="px-3 py-6 text-center text-xs text-slate-400">
                                {props.orderQuery.trim().length < 2
                                    ? 'Digita almeno 2 caratteri'
                                    : 'Nessun ordine trovato'}
                            </li>
                        ) : (
                            props.orderHits.map((o) => (
                                <li key={o.id}>
                                    <button
                                        type="button"
                                        disabled={props.linking}
                                        onClick={() => props.onPick(o)}
                                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                        <p className="text-sm font-semibold text-slate-800 font-mono">
                                            {o.orderNumber || o.id.slice(0, 10)}
                                        </p>
                                        <p className="text-[11px] text-slate-500 truncate">
                                            {o.buyerFullName || 'Cliente n/d'}
                                            {o.partner?.shopName ? ` · ${o.partner.shopName}` : ''}
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
    );
}
