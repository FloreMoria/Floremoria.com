'use client';

/**
 * Elenco file caricati SDI/XLSX con Apri dettaglio ed Elimina.
 */

import { useState } from 'react';
import { CheckCircle2, Eye, Loader2, Trash2 } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

export type UploadedFileRow = {
    id: string;
    fileName: string;
    uploadedAt: string;
    sizeBytes: number;
    invoiceCount: number;
    totalNetCents?: number;
    passiveCount?: number;
    foreignCount?: number;
    activeCount?: number;
};

type InvoiceDetail = {
    id: string;
    vendorName: string;
    invoiceNumber: string | null;
    expenseDate: string;
    totalCents: number;
    netCents: number;
    vatCents: number;
    reconciled: boolean;
    invoiceRole: string;
    vendorVat: string | null;
};

function formatBytes(n: number): string {
    if (!n || n < 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatItDateTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function UploadedInvoicesFileList({
    uploads,
    emptyHint,
    onChanged,
}: {
    uploads: UploadedFileRow[];
    emptyHint?: string;
    onChanged?: () => void;
}) {
    const [detailId, setDetailId] = useState<string | null>(null);
    const [details, setDetails] = useState<InvoiceDetail[]>([]);
    const [detailFile, setDetailFile] = useState<string>('');
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const openDetail = async (id: string, fileName: string) => {
        setDetailId(id);
        setDetailFile(fileName);
        setLoadingDetail(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/invoices/uploads?id=${encodeURIComponent(id)}`
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                invoices?: InvoiceDetail[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Dettaglio non disponibile');
            setDetails(parsed.data?.invoices || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore dettaglio');
            setDetails([]);
        } finally {
            setLoadingDetail(false);
        }
    };

    const confirmDelete = async (id: string) => {
        setBusyId(id);
        setError(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/invoices/uploads?id=${encodeURIComponent(id)}`,
                { method: 'DELETE' }
            );
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Eliminazione fallita');
            setDeleteId(null);
            setDetailId(null);
            onChanged?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Eliminazione fallita');
        } finally {
            setBusyId(null);
        }
    };

    if (!uploads.length) {
        return (
            <p className="text-[11px] text-slate-400">
                {emptyHint || 'Nessun file caricato ancora in questa sezione.'}
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {error && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5">
                    {error}
                </p>
            )}
            <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full text-[11px]">
                    <thead>
                        <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-400">
                            <th className="px-2.5 py-1.5 font-bold">File</th>
                            <th className="px-2.5 py-1.5 font-bold whitespace-nowrap">Caricato</th>
                            <th className="px-2.5 py-1.5 font-bold text-right">Fatture</th>
                            <th className="px-2.5 py-1.5 font-bold text-right">Imponibile</th>
                            <th className="px-2.5 py-1.5 font-bold text-right">Stato</th>
                            <th className="px-2.5 py-1.5 font-bold text-right">Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        {uploads.map((u) => (
                            <tr key={u.id} className="border-t border-slate-50">
                                <td
                                    className="px-2.5 py-1.5 max-w-[140px] truncate font-medium text-slate-800"
                                    title={u.fileName}
                                >
                                    {u.fileName}
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                        {formatBytes(u.sizeBytes)}
                                    </span>
                                </td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-500">
                                    {formatItDateTime(u.uploadedAt)}
                                </td>
                                <td className="px-2.5 py-1.5 text-right font-mono text-slate-700">
                                    {u.invoiceCount}
                                </td>
                                <td className="px-2.5 py-1.5 text-right font-mono text-slate-700">
                                    €{euro(u.totalNetCents || 0)}
                                </td>
                                <td className="px-2.5 py-1.5 text-right">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold">
                                        <CheckCircle2 size={11} />
                                        Caricato
                                    </span>
                                </td>
                                <td className="px-2.5 py-1.5 text-right">
                                    <div className="inline-flex gap-1">
                                        <button
                                            type="button"
                                            title="Apri / Visualizza Dettaglio"
                                            onClick={() => void openDetail(u.id, u.fileName)}
                                            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
                                        >
                                            <Eye size={11} />
                                            Apri
                                        </button>
                                        <button
                                            type="button"
                                            title="Elimina"
                                            onClick={() => setDeleteId(u.id)}
                                            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-rose-200 text-rose-700 font-bold hover:bg-rose-50"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {detailId && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
                    onClick={() => setDetailId(null)}
                >
                    <div
                        className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">
                                    Dettaglio upload
                                </p>
                                <p className="text-[11px] text-slate-500 truncate max-w-md">
                                    {detailFile}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetailId(null)}
                                className="text-xs font-bold text-slate-500 hover:text-slate-800"
                            >
                                Chiudi
                            </button>
                        </div>
                        <div className="overflow-auto flex-1 p-3">
                            {loadingDetail ? (
                                <p className="text-xs text-slate-400 flex items-center gap-2 py-6 justify-center">
                                    <Loader2 size={14} className="animate-spin" /> Caricamento…
                                </p>
                            ) : details.length === 0 ? (
                                <p className="text-xs text-slate-400 py-6 text-center">
                                    Nessuna fattura collegata a questo file.
                                </p>
                            ) : (
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="text-left text-[10px] uppercase text-slate-400 border-b">
                                            <th className="py-1.5 pr-2">Fornitore</th>
                                            <th className="py-1.5 pr-2">N. Doc</th>
                                            <th className="py-1.5 pr-2">Data</th>
                                            <th className="py-1.5 pr-2 text-right">Importo</th>
                                            <th className="py-1.5">Fineco</th>
                                            <th className="py-1.5">Ruolo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {details.map((d) => (
                                            <tr key={d.id} className="border-t border-slate-50">
                                                <td className="py-1.5 pr-2 max-w-[140px] truncate">
                                                    {d.vendorName}
                                                    {d.vendorVat && (
                                                        <span className="block text-[10px] text-slate-400">
                                                            {d.vendorVat}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 pr-2 font-mono">
                                                    {d.invoiceNumber || '—'}
                                                </td>
                                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                                    {d.expenseDate}
                                                </td>
                                                <td className="py-1.5 pr-2 text-right font-mono">
                                                    €{euro(d.totalCents)}
                                                </td>
                                                <td className="py-1.5">
                                                    {d.reconciled ? (
                                                        <span className="text-emerald-700 font-bold">
                                                            Abbinato
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-700 font-bold">
                                                            Non abbinato
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 text-[10px] font-bold text-slate-500">
                                                    {d.invoiceRole}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {deleteId && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4"
                    onClick={() => setDeleteId(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-xl p-5 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-sm font-semibold text-slate-900">
                            Eliminare questo file e le relative fatture?
                        </p>
                        <p className="text-xs text-slate-500">
                            Eliminando questo file verranno rimosse le relative fatture e annullati
                            i relativi abbinamenti Fineco.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteId(null)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                disabled={busyId === deleteId}
                                onClick={() => void confirmDelete(deleteId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white disabled:opacity-50"
                            >
                                {busyId === deleteId ? (
                                    <Loader2 size={12} className="animate-spin" />
                                ) : (
                                    <Trash2 size={12} />
                                )}
                                Elimina
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
