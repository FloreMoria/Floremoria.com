'use client';

/**
 * Registro Contabilità: tutte le fatture/ricevute fioristi (ordini con compenso)
 * + stati persistenti e badge cromatici.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
    FLORIST_DOC_STATUSES,
    FLORIST_DOC_STATUS_LABELS,
    type FloristCompensationRow,
    type FloristDocStatus,
} from '@/lib/financial/floristDocStatus';

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

type StatusFilter = 'ALL' | FloristDocStatus;

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatOrderRef(row: FloristCompensationRow): string {
    if (row.orderNumber) {
        const n = row.orderNumber.trim();
        return n.startsWith('#') || /^ORD/i.test(n) ? n : `#${n}`;
    }
    return `#${row.orderId.slice(0, 10)}…`;
}

function statusBadgeClass(status: FloristDocStatus): string {
    switch (status) {
        case 'INVOICE_ASSOCIATED':
            return 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold';
        case 'RECEIPT_ASSOCIATED':
            return 'bg-teal-100 text-teal-900 border border-teal-300 font-semibold';
        case 'WAITING_INVOICE':
            return 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold';
        case 'NOT_DUE':
            return 'bg-slate-100 text-slate-700 border border-slate-300 font-semibold';
        case 'CANCELLED':
            return 'bg-rose-50 text-rose-800 border border-rose-200 font-semibold';
        default:
            return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
}

const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'ALL', label: 'Tutti' },
    { id: 'WAITING_INVOICE', label: 'In attesa fattura' },
    { id: 'INVOICE_ASSOCIATED', label: 'Fattura Associata' },
    { id: 'RECEIPT_ASSOCIATED', label: 'Scontrino Associato' },
    { id: 'NOT_DUE', label: 'Non dovuto/Altro' },
    { id: 'CANCELLED', label: 'Annullato' },
];

const API = '/api/dashboard/finance/florist-missing-invoices';

export default function FloristMissingInvoicesPanel({ onLinkInvoice }: Props) {
    const [rows, setRows] = useState<FloristCompensationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

    const [linkRow, setLinkRow] = useState<FloristCompensationRow | null>(null);
    const [editRow, setEditRow] = useState<FloristCompensationRow | null>(null);
    const [orderQuery, setOrderQuery] = useState('');
    const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
    const [searchingOrders, setSearchingOrders] = useState(false);
    const [linking, setLinking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [editDate, setEditDate] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editStatus, setEditStatus] = useState<FloristDocStatus>('WAITING_INVOICE');
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(API);
            const parsed = await readJsonResponse<{
                ok?: boolean;
                rows?: FloristCompensationRow[];
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

    const filteredRows = useMemo(() => {
        if (statusFilter === 'ALL') return rows;
        return rows.filter((r) => r.docStatus === statusFilter);
    }, [rows, statusFilter]);

    const waitingCount = rows.filter((r) => r.docStatus === 'WAITING_INVOICE').length;
    const criticalWaiting = rows.filter(
        (r) => r.docStatus === 'WAITING_INVOICE' && r.daysSinceOrder >= 15
    ).length;

    const openEdit = (row: FloristCompensationRow) => {
        setEditRow(row);
        setEditDate(row.orderDate);
        setEditAmount((row.amountCents / 100).toFixed(2).replace('.', ','));
        setEditNotes(row.notes || '');
        setEditStatus(row.docStatus);
        setOrderQuery(row.orderNumber || '');
        setOrderHits([]);
        setFlash(null);
    };

    const remind = async (row: FloristCompensationRow, channel: 'email' | 'whatsapp') => {
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
                    paymentDate: row.orderDate,
                    daysSincePayment: row.daysSinceOrder,
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

    const associateOrder = async (order: OrderHit, target: FloristCompensationRow) => {
        if (!target.bankLineId) {
            setFlash('Associazione bonifico disponibile solo se esiste un movimento bancario collegabile.');
            return;
        }
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
                }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                message?: string;
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Associazione fallita');
            setFlash(parsed.data?.message || 'Ordine associato');
            setLinkRow(null);
            setEditRow(null);
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

            const patchRes = await fetch(API, {
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
            const patchParsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
            }>(patchRes);
            if (!patchParsed.ok) throw new Error(patchParsed.error || 'Salvataggio fallito');

            if (editStatus !== editRow.docStatus) {
                const stRes = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'set_doc_status',
                        rowId: editRow.id,
                        docStatus: editStatus,
                    }),
                });
                const stParsed = await readJsonResponse<{
                    ok?: boolean;
                    error?: string;
                }>(stRes);
                if (!stParsed.ok) throw new Error(stParsed.error || 'Aggiornamento stato fallito');
            }

            setFlash('Modifiche salvate');
            setEditRow(null);
            await load();
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Salvataggio fallito');
        } finally {
            setSaving(false);
        }
    };

    const setStatusInline = async (row: FloristCompensationRow, docStatus: FloristDocStatus) => {
        setBusyId(`${row.id}-status`);
        setFlash(null);
        try {
            const res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_doc_status',
                    rowId: row.id,
                    docStatus,
                }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                message?: string;
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Aggiornamento stato fallito');
            setFlash(parsed.data?.message || 'Stato aggiornato');
            await load();
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Aggiornamento stato fallito');
        } finally {
            setBusyId(null);
        }
    };

    const dismissRow = async (row: FloristCompensationRow) => {
        const ok = window.confirm(
            `Archiviare / segnare come «Non dovuto» ${row.partnerName}` +
                (row.orderNumber ? ` (ordine ${row.orderNumber})` : '') +
                '?'
        );
        if (!ok) return;
        await setStatusInline(row, 'NOT_DUE');
    };

    const uploadReceipt = async (row: FloristCompensationRow, file: File) => {
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
            setFlash(
                parsed.data?.message ||
                    'Scontrino fiscale salvato (solo Contabilità — non in GdM/bacheche).'
            );
            if (editRow?.id === row.id && parsed.data?.receiptUrl) {
                setEditRow({
                    ...editRow,
                    receiptUrl: parsed.data.receiptUrl,
                    docStatus: 'RECEIPT_ASSOCIATED',
                    statusLabel: FLORIST_DOC_STATUS_LABELS.RECEIPT_ASSOCIATED,
                });
                setEditStatus('RECEIPT_ASSOCIATED');
            }
            await load();
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Upload fallito');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <div className="space-y-3">
            <div
                className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${
                    criticalWaiting > 0
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : waitingCount > 0
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
            >
                <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                <div className="text-sm flex-1 min-w-0">
                    <p className="font-semibold">Registro fatture / ricevute fioristi</p>
                    <p className="text-xs mt-0.5 opacity-90">
                        {rows.length} ordini con compenso · {waitingCount} in attesa documento
                        {criticalWaiting > 0 ? ` · ${criticalWaiting} oltre 15 giorni` : ''}.
                        Scontrini solo Contabilità (mai GdM/bacheche).
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

            <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => {
                    const count =
                        f.id === 'ALL'
                            ? rows.length
                            : rows.filter((r) => r.docStatus === f.id).length;
                    const active = statusFilter === f.id;
                    return (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setStatusFilter(f.id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                                active
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            {f.label}
                            <span
                                className={`min-w-[1.25rem] text-center rounded-full px-1 ${
                                    active ? 'bg-white/20' : 'bg-slate-100'
                                }`}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

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
                    Caricamento registro fioristi…
                </div>
            ) : filteredRows.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                    Nessun record per il filtro selezionato.
                </div>
            ) : (
                <div className="dashboard-table-scroll overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-4 py-3 font-bold">Ordine</th>
                                <th className="px-4 py-3 font-bold">Fiorista & P.IVA</th>
                                <th className="px-4 py-3 font-bold">Data</th>
                                <th className="px-4 py-3 font-bold text-right">Compenso</th>
                                <th className="px-4 py-3 font-bold">Documento</th>
                                <th className="px-4 py-3 font-bold">Stato</th>
                                <th className="px-4 py-3 font-bold text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {filteredRows.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-50/80">
                                    <td className="px-4 py-3">
                                        <p className="font-mono text-xs font-semibold text-slate-800">
                                            {formatOrderRef(row)}
                                        </p>
                                        {row.daysSinceOrder > 0 &&
                                            row.docStatus === 'WAITING_INVOICE' && (
                                                <p className="text-[10px] text-amber-700 mt-0.5">
                                                    Attesa {row.daysSinceOrder} gg
                                                </p>
                                            )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-900">{row.partnerName}</p>
                                        <p className="text-[11px] text-slate-500 font-mono">
                                            {row.partnerVat || 'P.IVA n/d'}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                        {formatFinanceDate(row.orderDate)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                                        €{euro(row.amountCents)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {row.receiptUrl ? (
                                            <a
                                                href={row.receiptUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 hover:underline"
                                                title="Allegato fiscale — solo Contabilità"
                                            >
                                                <Paperclip size={10} />
                                                {row.linkedExpenseDocType === 'FATTURA'
                                                    ? 'Fattura'
                                                    : 'Scontrino'}
                                            </a>
                                        ) : (
                                            <span className="text-[11px] text-slate-400 italic">
                                                Nessun allegato
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={row.docStatus}
                                            disabled={busyId === `${row.id}-status`}
                                            onChange={(e) =>
                                                void setStatusInline(
                                                    row,
                                                    e.target.value as FloristDocStatus
                                                )
                                            }
                                            className={`max-w-[11rem] rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wide outline-none cursor-pointer disabled:opacity-50 ${statusBadgeClass(row.docStatus)}`}
                                            title="Modifica stato (salvato subito)"
                                        >
                                            {FLORIST_DOC_STATUSES.map((s) => (
                                                <option key={s} value={s}>
                                                    {FLORIST_DOC_STATUS_LABELS[s]}
                                                </option>
                                            ))}
                                        </select>
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
                                                title="Non dovuto / archivia"
                                                disabled={!!busyId}
                                                onClick={() => void dismissRow(row)}
                                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                                            >
                                                <Trash2 size={14} />
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
                                                WA
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onLinkInvoice?.({
                                                        vendorName: row.partnerName,
                                                        totalEuro: (row.amountCents / 100).toFixed(2),
                                                        expenseDate: row.orderDate,
                                                        notes: `Collegamento fattura ordine ${row.orderNumber || row.orderId}`,
                                                    })
                                                }
                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wide hover:bg-slate-800"
                                            >
                                                <Link2 size={12} />
                                                Fattura
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
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
                                    {linkRow.partnerName} · €{euro(linkRow.amountCents)}
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
                            <div className="relative">
                                <Search
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                />
                                <input
                                    value={orderQuery}
                                    onChange={(e) => setOrderQuery(e.target.value)}
                                    placeholder="Es. FF-VI-26-003"
                                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#c5a880]"
                                    autoFocus
                                />
                            </div>
                            {searchingOrders && (
                                <p className="text-xs text-slate-400 inline-flex items-center gap-1">
                                    <Loader2 size={12} className="animate-spin" /> Ricerca…
                                </p>
                            )}
                            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-64 overflow-y-auto">
                                {orderHits.map((o) => (
                                    <li key={o.id}>
                                        <button
                                            type="button"
                                            disabled={linking}
                                            onClick={() => void associateOrder(o, linkRow)}
                                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            <p className="text-sm font-semibold font-mono">
                                                {o.orderNumber || o.id.slice(0, 10)}
                                            </p>
                                            <p className="text-[11px] text-slate-500 truncate">
                                                {o.buyerFullName || 'Cliente n/d'}
                                            </p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
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
                                <h3 className="text-sm font-bold text-slate-800">Modifica registro</h3>
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
                                Stato documento
                                <select
                                    value={editStatus}
                                    onChange={(e) =>
                                        setEditStatus(e.target.value as FloristDocStatus)
                                    }
                                    className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${statusBadgeClass(editStatus)}`}
                                >
                                    {FLORIST_DOC_STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                            {FLORIST_DOC_STATUS_LABELS[s]}
                                        </option>
                                    ))}
                                </select>
                            </label>
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
                                    Scontrino / ricevuta fiscale
                                </p>
                                <p className="text-[11px] text-slate-500 leading-snug">
                                    Solo Contabilità. Non pubblicato in GdM né nelle bacheche.
                                </p>
                                {editRow.receiptUrl ? (
                                    <a
                                        href={editRow.receiptUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-teal-700 font-semibold hover:underline inline-flex items-center gap-1"
                                    >
                                        <Paperclip size={12} /> Apri allegato fiscale
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
