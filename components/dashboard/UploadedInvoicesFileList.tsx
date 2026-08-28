'use client';

/**
 * Elenco file caricati SDI/XLSX: tabella scrollabile, dettaglio al clic, eliminazione batch/singola.
 */

import { useState } from 'react';
import { CheckCircle2, Eye, Loader2, Trash2, X } from 'lucide-react';
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
    source?: string | null;
};

type InvoiceDetailExtended = InvoiceDetail & {
    description?: string;
    docType?: string;
    vatRate?: number | null;
    lineDescriptions?: string[];
    tipoDocumento?: string | null;
    docKind?: string | null;
    blobUrl?: string | null;
    contentType?: string | null;
    notes?: string | null;
    archiveFileName?: string | null;
    isReverseCharge?: boolean;
};

const SCROLL_TABLE =
    'dashboard-table-scroll overflow-y-auto overflow-x-auto [scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300';

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

function formatItDate(iso: string): string {
    const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso;
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
    fillHeight = false,
}: {
    uploads: UploadedFileRow[];
    emptyHint?: string;
    onChanged?: () => void;
    /** Riempie l'altezza del contenitore padre con tabella scrollabile */
    fillHeight?: boolean;
}) {
    const [batchDetailId, setBatchDetailId] = useState<string | null>(null);
    const [batchInvoices, setBatchInvoices] = useState<InvoiceDetail[]>([]);
    const [batchFileName, setBatchFileName] = useState('');
    const [loadingBatch, setLoadingBatch] = useState(false);

    const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetailExtended | null>(null);
    const [loadingInvoice, setLoadingInvoice] = useState(false);

    const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);
    const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const openBatchDetail = async (id: string, fileName: string) => {
        setBatchDetailId(id);
        setBatchFileName(fileName);
        setLoadingBatch(true);
        setError(null);
        setInvoiceDetail(null);
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
            setBatchInvoices(parsed.data?.invoices || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore dettaglio');
            setBatchInvoices([]);
        } finally {
            setLoadingBatch(false);
        }
    };

    const openInvoiceDetail = async (expenseId: string) => {
        setLoadingInvoice(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/invoices/uploads?expenseId=${encodeURIComponent(expenseId)}`
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                invoice?: InvoiceDetailExtended;
                error?: string;
            }>(res);
            if (!parsed.ok || !parsed.data?.invoice) {
                throw new Error(parsed.error || 'Dettaglio fattura non disponibile');
            }
            setInvoiceDetail(parsed.data.invoice);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore dettaglio fattura');
        } finally {
            setLoadingInvoice(false);
        }
    };

    const confirmDeleteBatch = async (id: string) => {
        setBusyId(id);
        setError(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/invoices/uploads?id=${encodeURIComponent(id)}`,
                { method: 'DELETE' }
            );
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Eliminazione fallita');
            setDeleteBatchId(null);
            setBatchDetailId(null);
            onChanged?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Eliminazione fallita');
        } finally {
            setBusyId(null);
        }
    };

    const confirmDeleteInvoice = async (expenseId: string) => {
        setBusyId(expenseId);
        setError(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/invoices/uploads?expenseId=${encodeURIComponent(expenseId)}`,
                { method: 'DELETE' }
            );
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Eliminazione fallita');
            setDeleteInvoiceId(null);
            setInvoiceDetail(null);
            if (batchDetailId) {
                setBatchInvoices((prev) => prev.filter((i) => i.id !== expenseId));
            }
            onChanged?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Eliminazione fallita');
        } finally {
            setBusyId(null);
        }
    };

    if (!uploads.length) {
        return (
            <p className="text-[11px] text-slate-400 py-2">
                {emptyHint || 'Nessun file caricato ancora in questa sezione.'}
            </p>
        );
    }

    const tableWrapClass = fillHeight
        ? `flex-1 min-h-0 rounded-xl border border-slate-100 ${SCROLL_TABLE}`
        : `max-h-[220px] rounded-xl border border-slate-100 ${SCROLL_TABLE}`;

    return (
        <div className={fillHeight ? 'flex flex-col flex-1 min-h-0 gap-2' : 'space-y-2'}>
            {error && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5 shrink-0">
                    {error}
                </p>
            )}
            <div className={tableWrapClass}>
                <table className="w-full text-[11px] table-fixed min-w-[520px]">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                        <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                            <th className="px-2.5 py-2 font-bold w-[28%]">File</th>
                            <th className="px-2.5 py-2 font-bold w-[18%] whitespace-nowrap">Caricato</th>
                            <th className="px-2.5 py-2 font-bold w-[10%] text-right">Fatture</th>
                            <th className="px-2.5 py-2 font-bold w-[14%] text-right">Imponibile</th>
                            <th className="px-2.5 py-2 font-bold w-[14%] text-right">Stato</th>
                            <th className="px-2.5 py-2 font-bold w-[16%] text-right">Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        {uploads.map((u) => (
                            <tr
                                key={u.id}
                                onClick={() => void openBatchDetail(u.id, u.fileName)}
                                className="border-t border-slate-50 cursor-pointer transition-colors hover:bg-slate-50/90 align-top"
                            >
                                <td className="px-2.5 py-2">
                                    <div
                                        className="font-medium text-slate-800 line-clamp-2 break-all"
                                        title={u.fileName}
                                    >
                                        {u.fileName}
                                    </div>
                                    <span className="text-[10px] text-slate-400">
                                        {formatBytes(u.sizeBytes)}
                                    </span>
                                </td>
                                <td className="px-2.5 py-2 whitespace-nowrap text-slate-500">
                                    {formatItDateTime(u.uploadedAt)}
                                </td>
                                <td className="px-2.5 py-2 text-right font-mono text-slate-700">
                                    {u.invoiceCount}
                                </td>
                                <td className="px-2.5 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                                    €{euro(u.totalNetCents || 0)}
                                </td>
                                <td className="px-2.5 py-2 text-right">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold whitespace-nowrap">
                                        <CheckCircle2 size={11} />
                                        Caricato
                                    </span>
                                </td>
                                <td className="px-2.5 py-2 text-right">
                                    <div
                                        className="inline-flex gap-1"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            type="button"
                                            title="Apri dettaglio"
                                            onClick={() => void openBatchDetail(u.id, u.fileName)}
                                            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-white"
                                        >
                                            <Eye size={11} />
                                            Apri
                                        </button>
                                        <button
                                            type="button"
                                            title="Elimina report"
                                            onClick={() => setDeleteBatchId(u.id)}
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

            {/* Modale dettaglio batch / report */}
            {batchDetailId && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
                    onClick={() => {
                        setBatchDetailId(null);
                        setInvoiceDetail(null);
                    }}
                >
                    <div
                        className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <div className="min-w-0 pr-3">
                                <p className="text-sm font-semibold text-slate-900">
                                    Dettaglio file importato
                                </p>
                                <p className="text-[11px] text-slate-500 truncate" title={batchFileName}>
                                    {batchFileName}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setBatchDetailId(null);
                                    setInvoiceDetail(null);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
                            >
                                <X size={14} />
                                Chiudi
                            </button>
                        </div>
                        <div className={`flex-1 min-h-0 p-3 ${SCROLL_TABLE}`}>
                            {loadingBatch ? (
                                <p className="text-xs text-slate-400 flex items-center gap-2 py-6 justify-center">
                                    <Loader2 size={14} className="animate-spin" /> Caricamento…
                                </p>
                            ) : batchInvoices.length === 0 ? (
                                <p className="text-xs text-slate-400 py-6 text-center">
                                    Nessuna fattura collegata a questo file.
                                </p>
                            ) : (
                                <table className="w-full text-[11px] table-fixed min-w-[640px]">
                                    <thead className="sticky top-0 bg-white z-10">
                                        <tr className="text-left text-[10px] uppercase text-slate-400 border-b">
                                            <th className="py-1.5 px-2 w-[24%]">Fornitore</th>
                                            <th className="py-1.5 px-2 w-[12%]">N. Doc</th>
                                            <th className="py-1.5 px-2 w-[10%]">Data</th>
                                            <th className="py-1.5 px-2 w-[12%] text-right">Impon.</th>
                                            <th className="py-1.5 px-2 w-[10%] text-right">IVA</th>
                                            <th className="py-1.5 px-2 w-[12%] text-right">Totale</th>
                                            <th className="py-1.5 px-2 w-[10%]">Fineco</th>
                                            <th className="py-1.5 px-2 w-[10%]">Ruolo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batchInvoices.map((d) => (
                                            <tr
                                                key={d.id}
                                                onClick={() => void openInvoiceDetail(d.id)}
                                                className="border-t border-slate-50 cursor-pointer hover:bg-slate-50/80 align-top"
                                            >
                                                <td className="py-1.5 px-2">
                                                    <div
                                                        className="line-clamp-2 font-medium text-slate-800"
                                                        title={d.vendorName}
                                                    >
                                                        {d.vendorName}
                                                    </div>
                                                    {d.vendorVat && (
                                                        <span className="text-[10px] text-slate-400 block truncate">
                                                            P.IVA {d.vendorVat}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-2 font-mono truncate">
                                                    {d.invoiceNumber || '—'}
                                                </td>
                                                <td className="py-1.5 px-2 whitespace-nowrap">
                                                    {formatItDate(d.expenseDate)}
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap">
                                                    €{euro(d.netCents)}
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap">
                                                    €{euro(d.vatCents)}
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap">
                                                    €{euro(d.totalCents)}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                    {d.reconciled ? (
                                                        <span className="text-emerald-700 font-bold text-[10px]">
                                                            Abbinato
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-700 font-bold text-[10px]">
                                                            Non abbinato
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-2 text-[10px] font-bold text-slate-500 truncate">
                                                    {d.invoiceRole}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="px-4 py-2 border-t border-slate-100 flex justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => setDeleteBatchId(batchDetailId)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50"
                            >
                                <Trash2 size={12} />
                                Elimina intero report
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modale dettaglio singola fattura */}
            {(invoiceDetail || loadingInvoice) && (
                <div
                    className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => !loadingInvoice && setInvoiceDetail(null)}
                >
                    <div
                        className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <p className="text-sm font-semibold text-slate-900">Dettaglio fattura</p>
                            <button
                                type="button"
                                onClick={() => setInvoiceDetail(null)}
                                className="text-xs font-bold text-slate-500 hover:text-slate-800"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className={`flex-1 min-h-0 p-4 space-y-3 ${SCROLL_TABLE}`}>
                            {loadingInvoice || !invoiceDetail ? (
                                <p className="text-xs text-slate-400 flex items-center gap-2 py-8 justify-center">
                                    <Loader2 size={14} className="animate-spin" /> Caricamento…
                                </p>
                            ) : (
                                <>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                                            Fornitore
                                        </p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {invoiceDetail.vendorName}
                                        </p>
                                        {invoiceDetail.vendorVat && (
                                            <p className="text-xs text-slate-500">
                                                P.IVA / CF: {invoiceDetail.vendorVat}
                                            </p>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <p className="text-[10px] uppercase text-slate-400 font-bold">
                                                N. documento
                                            </p>
                                            <p className="font-mono font-semibold">
                                                {invoiceDetail.invoiceNumber || '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase text-slate-400 font-bold">
                                                Data
                                            </p>
                                            <p>{formatItDate(invoiceDetail.expenseDate)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase text-slate-400 font-bold">
                                                Tipo
                                            </p>
                                            <p>
                                                {invoiceDetail.tipoDocumento ||
                                                    invoiceDetail.docType ||
                                                    invoiceDetail.invoiceRole}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase text-slate-400 font-bold">
                                                Fineco
                                            </p>
                                            <p
                                                className={
                                                    invoiceDetail.reconciled
                                                        ? 'text-emerald-700 font-bold'
                                                        : 'text-amber-700 font-bold'
                                                }
                                            >
                                                {invoiceDetail.reconciled
                                                    ? 'Abbinato'
                                                    : 'Non abbinato'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 grid grid-cols-3 gap-2 text-center text-xs">
                                        <div>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">
                                                Imponibile
                                            </p>
                                            <p className="font-mono font-semibold">
                                                €{euro(invoiceDetail.netCents)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">
                                                IVA
                                                {invoiceDetail.vatRate != null
                                                    ? ` ${invoiceDetail.vatRate}%`
                                                    : ''}
                                            </p>
                                            <p className="font-mono font-semibold">
                                                €{euro(invoiceDetail.vatCents)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">
                                                Totale
                                            </p>
                                            <p className="font-mono font-semibold">
                                                €{euro(invoiceDetail.totalCents)}
                                            </p>
                                        </div>
                                    </div>
                                    {invoiceDetail.description && (
                                        <div>
                                            <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">
                                                Descrizione
                                            </p>
                                            <p className="text-xs text-slate-600">
                                                {invoiceDetail.description}
                                            </p>
                                        </div>
                                    )}
                                    {invoiceDetail.lineDescriptions &&
                                        invoiceDetail.lineDescriptions.length > 0 && (
                                            <div>
                                                <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">
                                                    Righe di costo
                                                </p>
                                                <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                                                    {invoiceDetail.lineDescriptions.map((line, i) => (
                                                        <li key={i}>{line}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    {invoiceDetail.blobUrl &&
                                        (invoiceDetail.contentType?.includes('xml') ||
                                            invoiceDetail.archiveFileName
                                                ?.toLowerCase()
                                                .endsWith('.xml')) && (
                                            <a
                                                href={invoiceDetail.blobUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex text-xs font-bold text-indigo-700 hover:underline"
                                            >
                                                Apri anteprima XML / allegato
                                            </a>
                                        )}
                                </>
                            )}
                        </div>
                        {invoiceDetail && (
                            <div className="px-4 py-3 border-t border-slate-100 flex justify-end shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setDeleteInvoiceId(invoiceDetail.id)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700"
                                >
                                    <Trash2 size={12} />
                                    Elimina fattura
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {deleteBatchId && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4"
                    onClick={() => setDeleteBatchId(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-xl p-5 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-sm font-semibold text-slate-900">
                            Eliminare questo file e le relative fatture?
                        </p>
                        <p className="text-xs text-slate-500">
                            Verranno rimosse tutte le fatture importate da questo batch e annullati
                            i relativi abbinamenti Fineco.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteBatchId(null)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                disabled={busyId === deleteBatchId}
                                onClick={() => void confirmDeleteBatch(deleteBatchId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white disabled:opacity-50"
                            >
                                {busyId === deleteBatchId ? (
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

            {deleteInvoiceId && (
                <div
                    className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setDeleteInvoiceId(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-xl p-5 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-sm font-semibold text-slate-900">
                            Eliminare questa fattura?
                        </p>
                        <p className="text-xs text-slate-500">
                            Il record contabile verrà rimosso e l&apos;eventuale abbinamento Fineco
                            scollegato.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteInvoiceId(null)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                disabled={busyId === deleteInvoiceId}
                                onClick={() => void confirmDeleteInvoice(deleteInvoiceId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white disabled:opacity-50"
                            >
                                {busyId === deleteInvoiceId ? (
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
