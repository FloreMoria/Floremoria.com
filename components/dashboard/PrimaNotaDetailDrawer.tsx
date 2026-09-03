'use client';

/**
 * Drawer dettaglio scrittura Prima Nota — metà schermo destro sotto chrome dashboard.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { formatFinanceDate } from '@/lib/financial/formatFinanceDate';
import { labelSourceTypeIt } from '@/lib/financial/fiscalItalianLabels';
import {
    categoryLabel,
    euro,
    formatSignedImporto,
    formatVatColumn,
    FONTE_OPTIONS,
    reconciliationStatusLabel,
    RECONCILIATION_STATUS_OPTIONS,
    resolveVatRate,
    type PrimaNotaDisplayEntry,
    type ReconciliationStatusOption,
} from '@/lib/financial/primaNotaShared';

type RelatedRow = {
    id: string;
    accountingDate: string;
    description: string;
    totalCents: number;
    direction: string;
    category: string;
    sourceType: string;
    reconciliationStatus: string;
};

type Props = {
    entry: PrimaNotaDisplayEntry | null;
    open: boolean;
    onClose: () => void;
    onFonteSaved?: (entryId: string, fonteLabel: string) => void;
    onStatusSaved?: (entryId: string, status: string) => void;
};

function attachmentBadge(kind: string): string {
    if (kind === 'FATTURA') return '📄';
    if (kind === 'SCONTRINO') return '🧾';
    if (kind === 'COMPENSO') return '💐';
    return '📎';
}

export default function PrimaNotaDetailDrawer({
    entry,
    open,
    onClose,
    onFonteSaved,
    onStatusSaved,
}: Props) {
    const [mounted, setMounted] = useState(false);
    const [chromeOffset, setChromeOffset] = useState('3.5rem');
    const [related, setRelated] = useState<RelatedRow[]>([]);
    const [loadingRelated, setLoadingRelated] = useState(false);
    const [savingFonte, setSavingFonte] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [localFonte, setLocalFonte] = useState('');
    const [localStatus, setLocalStatus] = useState('UNMATCHED');

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) return;
        const shell = document.querySelector('.dashboard-shell');
        const chromeH =
            shell && getComputedStyle(shell).getPropertyValue('--dashboard-chrome-h').trim();
        if (chromeH) setChromeOffset(chromeH);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (entry) {
            setLocalFonte(entry.sourceLabel);
            setLocalStatus(entry.reconciliationStatus || 'UNMATCHED');
        }
    }, [entry]);

    const loadRelated = useCallback(async (entryId: string) => {
        setLoadingRelated(true);
        try {
            const res = await fetch(
                `/api/dashboard/finance/historical-ledger?view=related&entryId=${encodeURIComponent(entryId)}`
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                rows?: RelatedRow[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Caricamento correlati fallito');
            setRelated(parsed.data?.rows || []);
        } catch {
            setRelated([]);
        } finally {
            setLoadingRelated(false);
        }
    }, []);

    useEffect(() => {
        if (open && entry?.id) void loadRelated(entry.id);
        else setRelated([]);
    }, [open, entry?.id, loadRelated]);

    const saveFonte = async (fonteLabel: string) => {
        if (!entry) return;
        setSavingFonte(true);
        try {
            const res = await fetch('/api/dashboard/finance/historical-ledger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_fonte',
                    entryId: entry.id,
                    fonteLabel,
                }),
            });
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Salvataggio fonte fallito');
            setLocalFonte(fonteLabel);
            onFonteSaved?.(entry.id, fonteLabel);
        } finally {
            setSavingFonte(false);
        }
    };

    const saveStatus = async (status: string) => {
        if (!entry) return;
        setSavingStatus(true);
        try {
            const res = await fetch('/api/dashboard/finance/historical-ledger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_reconciliation_status',
                    entryId: entry.id,
                    reconciliationStatus: status,
                }),
            });
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Salvataggio stato fallito');
            setLocalStatus(status);
            onStatusSaved?.(entry.id, status);
        } finally {
            setSavingStatus(false);
        }
    };

    if (!open || !mounted || !entry) return null;

    const amount = formatSignedImporto(entry.amountCents, entry.isEntrata);
    const vat = formatVatColumn(entry);
    const vatRate = resolveVatRate(entry);

    return createPortal(
        <div
            className="fixed inset-0 z-[60]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prima-nota-drawer-title"
        >
            <button
                type="button"
                className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-[1px]"
                aria-label="Chiudi dettaglio Prima Nota"
                onClick={onClose}
            />
            <aside
                className="fixed right-0 z-[61] flex w-full md:w-1/2 md:max-w-[50vw] flex-col border-l border-slate-200 bg-white shadow-2xl overflow-hidden"
                style={{
                    top: chromeOffset,
                    height: `calc(100dvh - ${chromeOffset})`,
                }}
            >
                <div className="sticky top-0 z-[1] shrink-0 border-b border-slate-100 bg-white px-5 py-4 flex items-start justify-between gap-3">
                    <div>
                        <h3
                            id="prima-nota-drawer-title"
                            className="text-lg font-display font-bold text-slate-900"
                        >
                            Dettaglio scrittura
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono">{entry.id}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    <section className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Dati generali & identificativi
                        </h4>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <Field label="Data" value={formatFinanceDate(entry.date)} />
                            <Field
                                label="Direzione"
                                value={entry.direction === 'ENTRATA' ? 'Entrata' : 'Uscita'}
                            />
                            <Field
                                label="Tipo fonte"
                                value={labelSourceTypeIt(entry.sourceType)}
                            />
                            <Field label="ID fonte" value={entry.sourceId || '—'} mono />
                            <Field label="ID ordine" value={entry.orderId || '—'} mono />
                            <Field label="ID partner" value={entry.partnerId || '—'} mono />
                            <Field label="Riga Fineco" value={entry.bankLineId || '—'} mono />
                            <Field label="Source key" value={entry.sourceKey || '—'} mono />
                        </dl>
                    </section>

                    <section className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Dati contabili completi
                        </h4>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-3">
                            <p className="text-sm font-medium text-slate-900 leading-snug">
                                {entry.description}
                            </p>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <Field
                                    label="Controparte"
                                    value={entry.counterpartyName || '—'}
                                />
                                <Field label="Categoria" value={categoryLabel(entry.category)} />
                                <Field label="Conto Dare" value={entry.dareAccount} mono />
                                <Field label="Conto Avere" value={entry.avereAccount} mono />
                                <Field label="Imponibile netto" value={`€ ${euro(entry.netCents)}`} />
                                <Field
                                    label="Dettaglio IVA"
                                    value={
                                        vatRate === 0
                                            ? 'Esente / non applicabile'
                                            : `IVA ${vatRate}% · € ${euro(entry.vatCents)}`
                                    }
                                />
                                <Field
                                    label="Totale"
                                    value={amount.text}
                                    valueClassName={`font-bold ${amount.className}`}
                                />
                            </dl>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Stato & fonte (modificabili)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="text-xs font-semibold text-slate-600">
                                Stato riconciliazione
                                <select
                                    disabled={savingStatus}
                                    value={localStatus}
                                    onChange={(e) => void saveStatus(e.target.value)}
                                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                >
                                    {RECONCILIATION_STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {reconciliationStatusLabel(s)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-xs font-semibold text-slate-600">
                                Fonte
                                <select
                                    disabled={savingFonte}
                                    value={localFonte}
                                    onChange={(e) => void saveFonte(e.target.value)}
                                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                >
                                    {FONTE_OPTIONS.map((f) => (
                                        <option key={f} value={f}>
                                            {f}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Documenti & allegati
                        </h4>
                        <dl className="grid grid-cols-1 gap-2 text-sm">
                            <Field label="Rif. documento" value={entry.documentRef || '—'} />
                        </dl>
                        {entry.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {entry.attachments.map((att) => (
                                    <span
                                        key={`${att.kind}-${att.label}-${att.entryId || ''}`}
                                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700"
                                    >
                                        {attachmentBadge(att.kind)} {att.label}
                                    </span>
                                ))}
                            </div>
                        )}
                        {entry.attachmentUrl ? (
                            <div className="flex flex-wrap gap-2">
                                <a
                                    href={entry.attachmentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-800 text-sm font-semibold hover:bg-blue-100"
                                >
                                    <ExternalLink size={14} />
                                    Visualizza allegato
                                </a>
                                <a
                                    href={entry.attachmentUrl}
                                    download
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
                                >
                                    <Download size={14} />
                                    Scarica
                                </a>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 italic">Nessun allegato collegato.</p>
                        )}
                    </section>

                    <section className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Dettaglio gateway (drill-down)
                        </h4>
                        {entry.gatewayDrillDown ? (
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                                <p className="text-xs text-indigo-900">
                                    {entry.gatewayDrillDown.kind === 'payout_credit'
                                        ? 'Accredito payout: suddivisione corrispettivi e commissioni trattenute dal gateway.'
                                        : entry.gatewayDrillDown.kind === 'sdd_debit'
                                          ? 'Addebito SDD Fineco abbinato alla spesa fornitore sul gateway.'
                                          : 'Movimenti gateway collegati a questa riga bancaria.'}
                                </p>
                                {(entry.gatewayDrillDown.grossSalesCents != null ||
                                    entry.gatewayDrillDown.feesCents != null) && (
                                    <dl className="grid grid-cols-2 gap-2 text-xs">
                                        {entry.gatewayDrillDown.grossSalesCents != null && (
                                            <div>
                                                <dt className="text-slate-500">Corrispettivi lordi</dt>
                                                <dd className="font-semibold text-emerald-800">
                                                    +€ {euro(entry.gatewayDrillDown.grossSalesCents)}
                                                </dd>
                                            </div>
                                        )}
                                        {entry.gatewayDrillDown.feesCents != null && (
                                            <div>
                                                <dt className="text-slate-500">Commissioni gateway</dt>
                                                <dd className="font-semibold text-rose-800">
                                                    −€ {euro(entry.gatewayDrillDown.feesCents)}
                                                </dd>
                                            </div>
                                        )}
                                        <div>
                                            <dt className="text-slate-500">Netto su Fineco</dt>
                                            <dd className="font-semibold text-slate-900">
                                                € {euro(entry.gatewayDrillDown.netCents)}
                                            </dd>
                                        </div>
                                    </dl>
                                )}
                                {entry.gatewayDrillDown.lines.length > 0 && (
                                    <ul className="divide-y divide-indigo-100 rounded-lg border border-indigo-100 bg-white text-xs">
                                        {entry.gatewayDrillDown.lines.map((line) => (
                                            <li
                                                key={line.id}
                                                className="flex items-center justify-between gap-2 px-2 py-1.5"
                                            >
                                                <span className="truncate text-slate-700" title={line.label}>
                                                    {line.label}
                                                    <span className="ml-1 text-[10px] text-slate-400">
                                                        {line.sourceType}
                                                    </span>
                                                </span>
                                                <span
                                                    className={`font-mono font-semibold whitespace-nowrap ${
                                                        line.amountCents >= 0
                                                            ? 'text-emerald-700'
                                                            : 'text-rose-700'
                                                    }`}
                                                >
                                                    {line.amountCents >= 0 ? '+' : '−'}€{' '}
                                                    {euro(Math.abs(line.amountCents))}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 italic">
                                Nessun dettaglio gateway collegato (bonifico diretto / onere bancario).
                            </p>
                        )}
                    </section>

                    <section className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Movimenti correlati
                        </h4>
                        {loadingRelated ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                                <Loader2 className="animate-spin" size={14} />
                                Caricamento movimenti collegati…
                            </div>
                        ) : related.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">
                                Nessun altro movimento collegato (ordine, documento, partner o riga
                                banca).
                            </p>
                        ) : (
                            <div className="dashboard-table-scroll overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-left text-xs min-w-[520px]">
                                    <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                                        <tr>
                                            <th className="px-2 py-2">Data</th>
                                            <th className="px-2 py-2">Descrizione</th>
                                            <th className="px-2 py-2">Categoria</th>
                                            <th className="px-2 py-2 text-right">Importo</th>
                                            <th className="px-2 py-2">Stato</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {related.map((r) => {
                                            const isIn = r.direction === 'ENTRATA' || r.totalCents > 0;
                                            const relAmount = formatSignedImporto(
                                                Math.abs(r.totalCents),
                                                isIn
                                            );
                                            return (
                                                <tr key={r.id} className="hover:bg-slate-50/70">
                                                    <td className="px-2 py-2 whitespace-nowrap">
                                                        {formatFinanceDate(
                                                            String(r.accountingDate).slice(0, 10)
                                                        )}
                                                    </td>
                                                    <td
                                                        className="px-2 py-2 max-w-[180px] truncate"
                                                        title={r.description}
                                                    >
                                                        {r.description}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        {categoryLabel(r.category)}
                                                    </td>
                                                    <td
                                                        className={`px-2 py-2 text-right font-mono font-semibold whitespace-nowrap ${relAmount.className}`}
                                                    >
                                                        {relAmount.text}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        {reconciliationStatusLabel(
                                                            r.reconciliationStatus
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </aside>
        </div>,
        document.body
    );
}

function Field({
    label,
    value,
    mono,
    valueClassName,
}: {
    label: string;
    value: string;
    mono?: boolean;
    valueClassName?: string;
}) {
    return (
        <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd
                className={`mt-0.5 text-slate-800 ${mono ? 'font-mono text-xs break-all' : ''} ${valueClassName || ''}`}
            >
                {value}
            </dd>
        </div>
    );
}
