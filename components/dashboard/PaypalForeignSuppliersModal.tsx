'use client';

/**
 * Modale rendiconto pagamenti PayPal verso fornitori esteri (TD17/TD18).
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Globe2, Loader2, X } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import {
    currentPrimaNotaPeriodKey,
    PRIMA_NOTA_PERIOD_OPTIONS,
    type PrimaNotaPeriodKey,
} from '@/lib/financial/primaNotaShared';
import { normalizePrimaNotaPeriodKey } from '@/lib/financial/trimestreLabel';
import { FINANCE_PASSIVO_TABLE_SCROLL } from '@/components/dashboard/finance/financePassivoUi';

type PaymentRow = {
    id: string;
    date: string;
    vendorName: string;
    amountCents: number;
    txnId: string;
    docType: 'TD17' | 'TD18';
    jurisdiction: 'UE' | 'EXTRA_UE';
    natureLabel: string;
    docStatus: 'ATTACHED' | 'MISSING';
    documentLabel: string | null;
    attachmentUrl: string | null;
};

type ReportPayload = {
    year: number;
    periodKey: PrimaNotaPeriodKey;
    periodLabel: string;
    rows: PaymentRow[];
    totals: { count: number; totalPaidCents: number };
};

type Props = {
    open: boolean;
    onClose: () => void;
};

const FISCAL_YEAR = 2026;
const STORAGE_PRIMA = 'floremoria.primaNota.period';
const STORAGE_DOSSIER = 'floremoria.dossier.quarter';

function inheritPeriodKey(): PrimaNotaPeriodKey {
    if (typeof window === 'undefined') return currentPrimaNotaPeriodKey();
    try {
        const fromPrima = normalizePrimaNotaPeriodKey(window.localStorage.getItem(STORAGE_PRIMA));
        if (fromPrima) return fromPrima;
        const dossierQ = window.localStorage.getItem(STORAGE_DOSSIER);
        const fromDossier = normalizePrimaNotaPeriodKey(dossierQ ? `T${dossierQ}` : null);
        if (fromDossier) return fromDossier;
    } catch {
        /* ignore */
    }
    return currentPrimaNotaPeriodKey();
}

function euro(cents: number): string {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatItDate(iso: string): string {
    const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso || '—';
}

function csvEscape(value: string): string {
    if (/[;"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
}

export default function PaypalForeignSuppliersModal({ open, onClose }: Props) {
    const [periodKey, setPeriodKey] = useState<PrimaNotaPeriodKey>(currentPrimaNotaPeriodKey);
    const [periodReady, setPeriodReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<ReportPayload | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open) {
            setPeriodReady(false);
            return;
        }
        setPeriodKey(inheritPeriodKey());
        setPeriodReady(true);
    }, [open]);

    const load = useCallback(async (key: PrimaNotaPeriodKey) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/paypal-foreign-suppliers?year=${FISCAL_YEAR}&period=${encodeURIComponent(key)}`
            );
            const parsed = await readJsonResponse<ReportPayload>(res);
            if (!parsed.ok || !parsed.data) {
                throw new Error(parsed.error || 'Caricamento fallito');
            }
            setReport(parsed.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore');
            setReport(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open || !periodReady) return;
        void load(periodKey);
    }, [open, periodReady, periodKey, load]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const setPeriod = (key: PrimaNotaPeriodKey) => {
        setPeriodKey(key);
        try {
            window.localStorage.setItem(STORAGE_PRIMA, key);
            if (key.startsWith('T')) {
                window.localStorage.setItem(STORAGE_DOSSIER, key.slice(1));
            }
        } catch {
            /* ignore */
        }
    };

    const buildCsv = (): string => {
        const rows = report?.rows || [];
        const header = [
            'Data',
            'Fornitore / Servizio estero',
            'Importo EUR',
            'TRN PayPal',
            'Natura',
            'Stato documento',
        ].join(';');
        const lines = rows.map((r) =>
            [
                formatItDate(r.date),
                r.vendorName,
                (r.amountCents < 0 ? '-' : '') + euro(Math.abs(r.amountCents)),
                r.txnId,
                r.natureLabel,
                r.docStatus === 'ATTACHED' ? r.documentLabel || 'Archiviato' : 'Da allegare',
            ]
                .map((c) => csvEscape(String(c)))
                .join(';')
        );
        const tot = euro(Math.abs(report?.totals.totalPaidCents || 0));
        lines.push(['', `Totale ${rows.length} operazioni`, tot, '', '', ''].map(csvEscape).join(';'));
        return [header, ...lines].join('\n');
    };

    const exportCsv = () => {
        const csv = '\uFEFF' + buildCsv();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FloreMoria_PayPal_Fornitori_Esteri_${periodKey}_${FISCAL_YEAR}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copyForAccountant = async () => {
        try {
            await navigator.clipboard.writeText(buildCsv());
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Copia negli appunti non riuscita');
        }
    };

    if (!open || typeof document === 'undefined') return null;

    const periodOptions = PRIMA_NOTA_PERIOD_OPTIONS.map((o) => ({
        ...o,
        label: o.label.replace(/2026/g, String(FISCAL_YEAR)),
    }));

    return createPortal(
        <div
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paypal-foreign-suppliers-title"
            onClick={onClose}
        >
            <div
                className="w-full max-w-5xl max-h-[92dvh] rounded-t-2xl sm:rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="shrink-0 px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 rounded-xl bg-sky-50 p-2 text-sky-800">
                            <Globe2 size={18} />
                        </div>
                        <div className="min-w-0">
                            <h3
                                id="paypal-foreign-suppliers-title"
                                className="text-sm font-bold uppercase tracking-wider text-slate-800"
                            >
                                Rendiconto fornitori esteri (PayPal)
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Uscite commerciali già normalizzate (senza transiti carta). Suggerimento TD17/TD18
                                per reverse charge.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
                        aria-label="Chiudi"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="shrink-0 px-5 py-3 border-b border-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div
                        className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-0.5 gap-0.5"
                        role="tablist"
                        aria-label="Periodo trimestre"
                    >
                        {periodOptions.map((opt) => {
                            const active = periodKey === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setPeriod(opt.key)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                                        active
                                            ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {opt.key === 'YEAR' ? `Tutto il ${FISCAL_YEAR}` : `${opt.key} ${FISCAL_YEAR}`}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void copyForAccountant()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <Copy size={13} />
                            {copied ? 'Copiato' : 'Copia per commercialista'}
                        </button>
                        <button
                            type="button"
                            onClick={exportCsv}
                            disabled={!report?.rows.length}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50 text-[11px] font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                        >
                            <Download size={13} />
                            Esporta elenco CSV
                        </button>
                    </div>
                </div>

                <div className={`flex-1 min-h-0 ${FINANCE_PASSIVO_TABLE_SCROLL}`}>
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                            <Loader2 className="animate-spin" size={16} />
                            Caricamento movimenti PayPal…
                        </div>
                    ) : error ? (
                        <p className="px-5 py-8 text-sm text-rose-700">{error}</p>
                    ) : !report?.rows.length ? (
                        <p className="px-5 py-8 text-sm text-slate-500">
                            Nessun pagamento estero PayPal nel periodo selezionato.
                        </p>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-2 font-semibold">Data</th>
                                    <th className="px-4 py-2 font-semibold">Fornitore / Servizio estero</th>
                                    <th className="px-4 py-2 font-semibold text-right">Importo pagato</th>
                                    <th className="px-4 py-2 font-semibold">TRN PayPal</th>
                                    <th className="px-4 py-2 font-semibold">Natura</th>
                                    <th className="px-4 py-2 font-semibold">Stato documento</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.rows.map((r) => (
                                    <tr key={r.id} className="border-t border-slate-100">
                                        <td className="px-4 py-2 whitespace-nowrap tabular-nums text-slate-700">
                                            {formatItDate(r.date)}
                                        </td>
                                        <td className="px-4 py-2 font-medium text-slate-900">{r.vendorName}</td>
                                        <td
                                            className={`px-4 py-2 text-right tabular-nums font-semibold ${
                                                r.amountCents < 0 ? 'text-rose-700' : 'text-emerald-700'
                                            }`}
                                        >
                                            {r.amountCents < 0 ? '−' : '+'}
                                            {euro(Math.abs(r.amountCents))} €
                                        </td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-slate-600 break-all">
                                            {r.txnId || '—'}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span
                                                className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                                                    r.jurisdiction === 'UE'
                                                        ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                                                        : 'border-amber-200 bg-amber-50 text-amber-900'
                                                }`}
                                            >
                                                {r.natureLabel}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2">
                                            {r.docStatus === 'ATTACHED' ? (
                                                r.attachmentUrl ? (
                                                    <a
                                                        href={r.attachmentUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800"
                                                    >
                                                        Archiviato
                                                    </a>
                                                ) : (
                                                    <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                                        Archiviato
                                                    </span>
                                                )
                                            ) : (
                                                <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                                    Da allegare
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {report && !loading && (
                    <div className="shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-slate-600">
                            <span className="font-semibold text-slate-900">{report.totals.count}</span>{' '}
                            operazioni estere · {report.periodLabel}
                        </span>
                        <span className="font-semibold text-slate-900 tabular-nums">
                            Totale da autofattura / reverse charge:{' '}
                            <span className="text-rose-800">
                                {euro(Math.abs(report.totals.totalPaidCents))} €
                            </span>
                        </span>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
