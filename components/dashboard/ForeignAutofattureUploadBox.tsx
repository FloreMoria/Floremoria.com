'use client';

/**
 * Autofatture Estere: generatore XML TD17/TD18 (YouDoox) + upload XML/ZIP/PDF.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown,
    Code2,
    Download,
    Eye,
    Globe2,
    Loader2,
    Search,
    Trash2,
    UploadCloud,
    WalletCards,
} from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import {
    FINANCE_PASSIVO_CARD_CLASS,
    FINANCE_PASSIVO_TABLE_SCROLL,
    matchesPassivoSearch,
} from '@/components/dashboard/finance/financePassivoUi';
import PaypalForeignSuppliersModal from '@/components/dashboard/PaypalForeignSuppliersModal';

type Props = {
    onImported?: () => void;
};

type IngestSummary = {
    imported: number;
    updated?: number;
    foreignAutofatture?: number;
    matchedFineco: number;
    skippedDuplicates: number;
    totalCents: number;
    warnings: string[];
};

type VendorPreset = {
    id: string;
    label: string;
    defaultDocType: 'TD17' | 'TD18';
    defaultDescrizione: string;
};

type AutofatturaHistoryItem = {
    id: string;
    documentNumber: string;
    vendorName: string;
    autofatturaDate: string;
    foreignInvoiceDate: string | null;
    foreignInvoiceNumber: string | null;
    imponibileCents: number;
    vatCents: number;
    totaleCents: number;
    docType: string;
    reconciled: boolean;
    fileName: string | null;
    createdAt: string;
};

const PRESETS: VendorPreset[] = [
    { id: 'openai', label: 'OpenAI Ireland Ltd', defaultDocType: 'TD17', defaultDescrizione: 'SERVIZI' },
    { id: 'vercel', label: 'Vercel Inc.', defaultDocType: 'TD17', defaultDescrizione: 'SERVIZI HOSTING / EDGE' },
    { id: 'google', label: 'Google Ireland Ltd', defaultDocType: 'TD17', defaultDescrizione: 'SERVIZI CLOUD' },
    { id: 'stripe', label: 'Stripe Payments Europe', defaultDocType: 'TD17', defaultDescrizione: 'SERVIZI PAGAMENTI' },
    { id: 'meta', label: 'Meta Platforms', defaultDocType: 'TD17', defaultDescrizione: 'SERVIZI PUBBLICITARI' },
];

function downloadXml(fileName: string, xml: string) {
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatItDate(iso: string | null): string {
    if (!iso) return '—';
    const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso;
}

const SCROLL_TABLE = FINANCE_PASSIVO_TABLE_SCROLL;

function autofatturaSearchHaystack(h: AutofatturaHistoryItem): string {
    return [
        h.documentNumber,
        h.vendorName,
        h.foreignInvoiceNumber,
        h.docType,
        h.autofatturaDate,
        h.foreignInvoiceDate,
        formatItDate(h.autofatturaDate),
        formatItDate(h.foreignInvoiceDate),
        h.fileName,
    ]
        .filter(Boolean)
        .join(' ');
}

export default function ForeignAutofattureUploadBox({ onImported }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<IngestSummary | null>(null);

    // Generatore
    const [vendorId, setVendorId] = useState('openai');
    const [docType, setDocType] = useState<'TD17' | 'TD18'>('TD17');
    const [foreignInvoiceNumber, setForeignInvoiceNumber] = useState('');
    const [foreignInvoiceDate, setForeignInvoiceDate] = useState(
        new Date().toISOString().slice(0, 10)
    );
    const [imponibileEur, setImponibileEur] = useState('');

    // Upload PDF meta
    const [vendorName, setVendorName] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
    const [eurAmount, setEurAmount] = useState('');
    const [autofatturaType, setAutofatturaType] = useState<'TD17' | 'TD18' | 'TD19'>('TD17');
    const [countryCode, setCountryCode] = useState('US');
    const [jurisdiction, setJurisdiction] = useState<'UE' | 'EXTRA_UE'>('EXTRA_UE');

    const [historyOpen, setHistoryOpen] = useState(true);
    const [history, setHistory] = useState<AutofatturaHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [actionId, setActionId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [detailItem, setDetailItem] = useState<AutofatturaHistoryItem | null>(null);
    const [historySearch, setHistorySearch] = useState('');
    const [paypalForeignOpen, setPaypalForeignOpen] = useState(false);

    const filteredHistory = useMemo(() => {
        if (!historySearch.trim()) return history;
        return history.filter((h) => matchesPassivoSearch(autofatturaSearchHaystack(h), historySearch));
    }, [history, historySearch]);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch('/api/dashboard/finance/autofatture');
            const parsed = await readJsonResponse<{
                ok?: boolean;
                items?: AutofatturaHistoryItem[];
                count?: number;
            }>(res);
            if (parsed.ok) setHistory(parsed.data?.items || []);
        } catch {
            /* silent */
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    const onVendorChange = (id: string) => {
        setVendorId(id);
        const p = PRESETS.find((x) => x.id === id);
        if (p) setDocType(p.defaultDocType);
    };

    const generateXml = async () => {
        setGenerating(true);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch('/api/dashboard/finance/autofatture/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendorId,
                    docType,
                    foreignInvoiceNumber: foreignInvoiceNumber.trim(),
                    foreignInvoiceDate,
                    autofatturaDate: foreignInvoiceDate,
                    imponibileEur,
                    persist: true,
                }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                message?: string;
                xml?: string;
                fileName?: string;
                pdfUrl?: string | null;
                expenseId?: string | null;
                matchedFineco?: boolean;
                documentNumber?: string;
            }>(res);
            if (!parsed.ok || !parsed.data?.xml || !parsed.data?.fileName) {
                throw new Error(parsed.error || parsed.data?.message || 'Generazione fallita');
            }
            downloadXml(parsed.data.fileName, parsed.data.xml);
            const pdfPath =
                parsed.data.pdfUrl ||
                (parsed.data.expenseId
                    ? `/api/dashboard/finance/autofatture/${parsed.data.expenseId}/pdf`
                    : null);
            if (pdfPath) {
                window.open(pdfPath, '_blank', 'noopener,noreferrer');
            }
            setMessage(
                `${parsed.data.message || 'XML scaricato'}` +
                    (pdfPath ? ' · PDF aperto in nuova scheda' : '')
            );
            await loadHistory();
            onImported?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Generazione fallita');
        } finally {
            setGenerating(false);
        }
    };

    const openPdf = (id: string) => {
        window.open(
            `/api/dashboard/finance/autofatture/${id}/pdf`,
            '_blank',
            'noopener,noreferrer'
        );
    };

    const redownloadXml = async (id: string) => {
        setActionId(id);
        setError(null);
        try {
            const res = await fetch(`/api/dashboard/finance/autofatture/${id}/xml`);
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                xml?: string;
                fileName?: string;
            }>(res);
            if (!parsed.ok || !parsed.data?.xml || !parsed.data?.fileName) {
                throw new Error(parsed.error || 'XML non disponibile');
            }
            downloadXml(parsed.data.fileName, parsed.data.xml);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Riscarica fallita');
        } finally {
            setActionId(null);
        }
    };

    const confirmDelete = async (id: string) => {
        setActionId(id);
        setError(null);
        try {
            const res = await fetch(`/api/dashboard/finance/autofatture/${id}`, {
                method: 'DELETE',
            });
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) {
                throw new Error(parsed.error || 'Eliminazione non riuscita');
            }
            setHistory((prev) => prev.filter((h) => h.id !== id));
            setDeleteConfirmId(null);
            setMessage('Autofattura eliminata. Abbinamento Fineco scollegato.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Eliminazione fallita');
        } finally {
            setActionId(null);
        }
    };

    const upload = async (file: File) => {
        setUploading(true);
        setError(null);
        setMessage(null);
        setSummary(null);
        try {
            const lower = file.name.toLowerCase();
            const needsMeta = /\.(pdf|png|jpe?g|webp)$/i.test(lower);
            const date =
                invoiceDate.trim() || new Date().toISOString().slice(0, 10);
            const amountRaw = eurAmount.trim().replace(',', '.');
            const amountNum = Number(amountRaw);

            if (needsMeta) {
                if (!date || !Number.isFinite(amountNum) || amountNum <= 0) {
                    throw new Error(
                        'Per PDF/immagine servono: Data fattura e Importo EUR (oltre al file).',
                    );
                }
            }

            const form = new FormData();
            form.append('file', file);
            if (needsMeta) {
                form.append(
                    'vendorName',
                    vendorName.trim() || file.name.replace(/\.[^.]+$/, ''),
                );
                form.append('invoiceDate', date);
                form.append('eurAmount', String(amountNum));
                form.append('amount', String(amountNum));
                form.append('originalAmount', String(amountNum));
                form.append('originalCurrency', 'EUR');
                form.append('autofatturaType', autofatturaType);
                form.append('countryCode', countryCode);
                form.append('jurisdiction', jurisdiction);
            }
            const res = await fetch('/api/dashboard/finance/invoices/upload-foreign', {
                method: 'POST',
                body: form,
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                message?: string;
                summary?: IngestSummary;
            }>(res);
            if (!parsed.ok) {
                throw new Error(parsed.error || parsed.data?.message || 'Upload fallito');
            }
            setMessage(parsed.data?.message || 'Import completato');
            setSummary(parsed.data?.summary || null);
            await loadHistory();
            onImported?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload fallito');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className={FINANCE_PASSIVO_CARD_CLASS}>
            <div className="flex items-start gap-3 shrink-0 min-h-[4.5rem]">
                <div className="mt-0.5 rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
                    <Globe2 size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                        Autofatture estere
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        Genera XML FatturaPA FPR12 TD17/TD18 (SDI <span className="font-mono">K0ROACV</span>,
                        SoggettoEmittente CC) pronto per YouDOX, oppure carica XML/ZIP/PDF già
                        emessi.
                    </p>
                    <button
                        type="button"
                        onClick={() => setPaypalForeignOpen(true)}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                    >
                        <WalletCards size={14} />
                        Rendiconto fornitori esteri (PayPal)
                    </button>
                </div>
            </div>

            {/* Generatore */}
            <div className="rounded-xl border border-slate-200 bg-indigo-50/30 p-3 space-y-2 shrink-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Creazione rapida XML
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                        value={vendorId}
                        onChange={(e) => onVendorChange(e.target.value)}
                        className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                    >
                        {PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                    <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value as 'TD17' | 'TD18')}
                        className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                    >
                        <option value="TD17">TD17 — Servizi estero</option>
                        <option value="TD18">TD18 — Beni UE</option>
                    </select>
                    <input
                        type="text"
                        value={foreignInvoiceNumber}
                        onChange={(e) => setForeignInvoiceNumber(e.target.value)}
                        placeholder="N. fattura estera (es. N2UJNHG9-0001)"
                        className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white sm:col-span-2"
                    />
                    <input
                        type="date"
                        value={foreignInvoiceDate}
                        onChange={(e) => setForeignInvoiceDate(e.target.value)}
                        className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                        title="Data fattura estera originale"
                    />
                    <input
                        type="text"
                        value={imponibileEur}
                        onChange={(e) => setImponibileEur(e.target.value)}
                        placeholder="Totale Imponibile (€)"
                        className="px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                    />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <button
                        type="button"
                        disabled={generating}
                        onClick={() => void generateXml()}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                        {generating ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Download size={14} />
                        )}
                        Scarica XML + apri PDF
                    </button>
                </div>
                <p className="text-[10px] text-slate-500">
                    Numero doc. progressivo <span className="font-mono">00000N-AAAA-EST</span> · IVA
                    22% in reverse charge · XML YouDOX + PDF leggibile · Contabilità + Fineco
                </p>
            </div>

            {/* Storico autofatture */}
            <div className="rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
                <button
                    type="button"
                    onClick={() => {
                        setHistoryOpen((o) => !o);
                        if (!historyOpen) void loadHistory();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 text-left shrink-0"
                >
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Storico Autofatture
                        <span className="ml-2 inline-flex min-w-[1.5rem] justify-center px-1.5 py-0.5 rounded-full bg-slate-800 text-white text-[10px]">
                            {history.length}
                        </span>
                    </span>
                    <ChevronDown
                        size={16}
                        className={`text-slate-500 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
                    />
                </button>
                {historyOpen && (
                    <div className="flex flex-col flex-1 min-h-0 border-t border-slate-200">
                        <div className="px-3 py-2 shrink-0 border-b border-slate-100 bg-white">
                            <div className="relative">
                                <Search
                                    size={14}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                                />
                                <input
                                    type="search"
                                    value={historySearch}
                                    onChange={(e) => setHistorySearch(e.target.value)}
                                    placeholder="Cerca fornitore, data, n. doc, descrizione…"
                                    className="w-full pl-8 pr-2 py-1.5 text-[11px] rounded-lg border border-slate-200 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
                                />
                            </div>
                        </div>
                        <div className={`flex-1 min-h-0 ${SCROLL_TABLE}`}>
                        {historyLoading ? (
                            <p className="px-3 py-4 text-xs text-slate-400 flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" /> Caricamento storico…
                            </p>
                        ) : filteredHistory.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-slate-400">
                                {history.length === 0
                                    ? 'Nessuna autofattura generata ancora.'
                                    : 'Nessun risultato per la ricerca.'}
                            </p>
                        ) : (
                            <table className="w-full text-[11px] table-fixed min-w-[580px]">
                                <thead className="sticky top-0 bg-white z-10">
                                    <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                        <th className="px-2 py-2 font-bold w-[16%]">N. Doc</th>
                                        <th className="px-2 py-2 font-bold w-[22%]">Fornitore</th>
                                        <th className="px-2 py-2 font-bold w-[16%]">Date</th>
                                        <th className="px-2 py-2 font-bold w-[18%] text-right">Importi</th>
                                        <th className="px-2 py-2 font-bold w-[12%]">Fineco</th>
                                        <th className="px-2 py-2 font-bold w-[16%] text-right">Azione</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHistory.map((h) => (
                                        <tr
                                            key={h.id}
                                            onClick={() => setDetailItem(h)}
                                            className="border-t border-slate-50 align-top cursor-pointer transition-colors hover:bg-indigo-50/40"
                                        >
                                            <td className="px-2 py-2">
                                                <div className="font-mono font-semibold text-slate-800 truncate">
                                                    {h.documentNumber}
                                                </div>
                                                <div className="text-[10px] text-indigo-700 font-bold">
                                                    {h.docType}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2">
                                                <div
                                                    className="line-clamp-2 font-medium text-slate-800"
                                                    title={h.vendorName}
                                                >
                                                    {h.vendorName}
                                                </div>
                                                {h.foreignInvoiceNumber && (
                                                    <div className="text-[10px] text-slate-400 truncate">
                                                        rif. {h.foreignInvoiceNumber}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 whitespace-nowrap text-slate-600 text-[10px]">
                                                <div>AF {formatItDate(h.autofatturaDate)}</div>
                                                <div className="text-slate-400">
                                                    Orig. {formatItDate(h.foreignInvoiceDate)}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2 text-right font-mono text-slate-700 whitespace-nowrap text-[10px]">
                                                <div>Imp. €{euro(h.imponibileCents)}</div>
                                                <div className="text-slate-400">
                                                    IVA €{euro(h.vatCents)} · Tot €
                                                    {euro(h.totaleCents)}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2">
                                                {h.reconciled ? (
                                                    <span className="inline-flex px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px]">
                                                        Abbinato
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-100 font-bold text-[10px]">
                                                        Non abbinato
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 text-right">
                                                <div
                                                    className="inline-flex flex-wrap justify-end gap-1"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <button
                                                        type="button"
                                                        title="Apri PDF"
                                                        onClick={() => openPdf(h.id)}
                                                        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-slate-200 text-slate-700 text-[10px] font-bold hover:bg-white"
                                                    >
                                                        <Eye size={11} />
                                                        PDF
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Scarica XML"
                                                        disabled={actionId === h.id}
                                                        onClick={() => void redownloadXml(h.id)}
                                                        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-indigo-200 text-indigo-800 text-[10px] font-bold disabled:opacity-50"
                                                    >
                                                        {actionId === h.id &&
                                                        deleteConfirmId !== h.id ? (
                                                            <Loader2 size={11} className="animate-spin" />
                                                        ) : (
                                                            <Code2 size={11} />
                                                        )}
                                                        XML
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Elimina"
                                                        disabled={actionId === h.id}
                                                        onClick={() => setDeleteConfirmId(h.id)}
                                                        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-rose-200 text-rose-700 text-[10px] font-bold hover:bg-rose-50 disabled:opacity-50"
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        </div>
                    </div>
                )}
            </div>

            {/* Upload PDF/immagine: meta obbligatori visibili */}
            <div className="space-y-2 shrink-0 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Carica XML / ZIP / PDF o immagine
                </p>
                <p className="text-[10px] text-slate-500">
                    Per PDF/immagine compilare Data e Importo prima di scegliere il file. XML/ZIP SDI
                    non richiedono questi campi.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[10px] font-semibold text-slate-500">Fornitore</span>
                        <input
                            type="text"
                            list="autofattura-vendor-presets"
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                            placeholder="Cursor, Google, Vercel, Transatel…"
                            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white"
                        />
                        <datalist id="autofattura-vendor-presets">
                            {PRESETS.map((p) => (
                                <option key={p.id} value={p.label} />
                            ))}
                            <option value="Cursor" />
                            <option value="Transatel" />
                        </datalist>
                    </label>
                    <label className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[10px] font-semibold text-slate-500">
                            Tipo documento
                        </span>
                        <select
                            value={autofatturaType}
                            onChange={(e) => {
                                const v = e.target.value as 'TD17' | 'TD18' | 'TD19';
                                setAutofatturaType(v);
                                setJurisdiction(v === 'TD18' ? 'UE' : 'EXTRA_UE');
                                setCountryCode(v === 'TD18' ? 'IE' : 'US');
                            }}
                            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white"
                        >
                            <option value="TD17">TD17 — Servizi estero</option>
                            <option value="TD18">TD18 — Beni/acquisti UE</option>
                            <option value="TD19">TD19</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[10px] font-semibold text-slate-500">
                            Data fattura *
                        </span>
                        <input
                            type="date"
                            required
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white"
                        />
                    </label>
                    <label className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[10px] font-semibold text-slate-500">
                            Importo Totale Documento / Imponibile (€) *
                        </span>
                        <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0.01"
                            required
                            value={eurAmount}
                            onChange={(e) => setEurAmount(e.target.value)}
                            placeholder="es. 20.00"
                            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white font-mono"
                        />
                    </label>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => {
                            const amountNum = Number(eurAmount.trim().replace(',', '.'));
                            // Avviso soft: PDF senza importo fallirebbe subito dopo la selezione file
                            if (
                                !invoiceDate.trim() ||
                                !eurAmount.trim() ||
                                !Number.isFinite(amountNum) ||
                                amountNum <= 0
                            ) {
                                setError(
                                    'Compila Data fattura e Importo EUR prima di caricare un PDF o un’immagine (XML/ZIP SDI ok senza).',
                                );
                            } else {
                                setError(null);
                            }
                            inputRef.current?.click();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-800 text-[11px] font-bold disabled:opacity-50"
                    >
                        {uploading ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <UploadCloud size={12} />
                        )}
                        Scegli file
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept=".zip,.xml,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => {
                            const files = e.target.files;
                            if (!files?.length) return;
                            void (async () => {
                                for (const f of Array.from(files)) {
                                    await upload(f);
                                }
                            })();
                        }}
                    />
                </div>
            </div>

            {(message || error || summary) && (
                <div className="shrink-0 max-h-[56px] overflow-y-auto space-y-1">
            {message && (
                <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                    {message}
                </p>
            )}
            {error && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    {error}
                </p>
            )}
            {summary && (
                <p className="text-[10px] text-slate-500">
                    Estere riconosciute: {summary.foreignAutofatture ?? 0} · Fineco:{' '}
                    {summary.matchedFineco} · duplicati: {summary.skippedDuplicates}
                </p>
            )}
                </div>
            )}

            {detailItem && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
                    onClick={() => setDetailItem(null)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-900">
                                Riepilogo autofattura
                            </p>
                            <button
                                type="button"
                                onClick={() => setDetailItem(null)}
                                className="text-xs font-bold text-slate-500 hover:text-slate-800"
                            >
                                Chiudi
                            </button>
                        </div>
                        <div className="p-4 space-y-3 text-xs">
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-bold">
                                    Documento
                                </p>
                                <p className="font-mono font-semibold text-slate-900">
                                    {detailItem.documentNumber}
                                </p>
                                <p className="text-indigo-700 font-bold">{detailItem.docType}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-bold">
                                    Fornitore estero
                                </p>
                                <p className="font-medium text-slate-800">{detailItem.vendorName}</p>
                                {detailItem.foreignInvoiceNumber && (
                                    <p className="text-slate-500">
                                        Fattura orig. {detailItem.foreignInvoiceNumber}
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <p className="text-[10px] uppercase text-slate-400 font-bold">
                                        Data AF
                                    </p>
                                    <p>{formatItDate(detailItem.autofatturaDate)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase text-slate-400 font-bold">
                                        Data orig.
                                    </p>
                                    <p>{formatItDate(detailItem.foreignInvoiceDate)}</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-indigo-50/50 border border-indigo-100 p-3 grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">
                                        Imponibile
                                    </p>
                                    <p className="font-mono font-semibold">
                                        €{euro(detailItem.imponibileCents)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">
                                        IVA 22% RC
                                    </p>
                                    <p className="font-mono font-semibold">
                                        €{euro(detailItem.vatCents)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">
                                        Totale
                                    </p>
                                    <p className="font-mono font-semibold">
                                        €{euro(detailItem.totaleCents)}
                                    </p>
                                </div>
                            </div>
                            <p
                                className={
                                    detailItem.reconciled
                                        ? 'text-emerald-700 font-bold'
                                        : 'text-amber-700 font-bold'
                                }
                            >
                                Fineco: {detailItem.reconciled ? 'Abbinato' : 'Non abbinato'}
                            </p>
                        </div>
                        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => openPdf(detailItem.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold hover:bg-slate-50"
                            >
                                <Eye size={12} />
                                Apri PDF
                            </button>
                            <button
                                type="button"
                                onClick={() => void redownloadXml(detailItem.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-800 text-xs font-bold"
                            >
                                <Code2 size={12} />
                                Scarica XML
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setDetailItem(null);
                                    setDeleteConfirmId(detailItem.id);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700"
                            >
                                <Trash2 size={12} />
                                Elimina
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirmId && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
                    onClick={() => setDeleteConfirmId(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-xl p-5 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-sm font-semibold text-slate-900">
                            Sei sicuro di voler eliminare questa autofattura?
                        </p>
                        <p className="text-xs text-slate-500">
                            Verranno rimossi il record in Contabilità, il file XML archiviato e
                            l&apos;eventuale abbinamento Fineco. L&apos;operazione non è annullabile.
                        </p>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                disabled={actionId === deleteConfirmId}
                                onClick={() => void confirmDelete(deleteConfirmId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                                {actionId === deleteConfirmId ? (
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
            <PaypalForeignSuppliersModal
                open={paypalForeignOpen}
                onClose={() => setPaypalForeignOpen(false)}
            />
        </div>
    );
}
