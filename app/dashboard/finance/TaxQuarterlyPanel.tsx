'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
    Download,
    FileText,
    RefreshCw,
    Landmark,
    Receipt,
    Pencil,
    Archive,
    FileSpreadsheet,
} from 'lucide-react';

type PeriodMode = 'quarter' | 'month' | 'quadrimester';
type SettlementStatus = 'PENDING' | 'BONIFICATO' | 'RICEVUTA';

type TaxRegisterRow = {
    orderId: string;
    date: string;
    orderNumber: string;
    buyerName: string;
    grossCents: number;
    floralImponibileCents: number;
    accessoryImponibileCents: number;
    accessoryGrossCents: number;
    ivaDebitoCents: number;
    gatewayLabel: string;
    gatewayFeeCents: number;
    floristName: string;
    floristCompensationCents: number;
    floristVatRate: number | null;
    settlementStatus: SettlementStatus;
    netMarginCents: number;
    financeNotes: string | null;
    hasReceipt: boolean;
};

type TaxRegisterReport = {
    bounds: { year: number; label: string; periodKey: string; mode: PeriodMode };
    summary: {
        grossCents: number;
        floralImponibileCents: number;
        accessoryImponibileCents: number;
        ivaDebitoCents: number;
        gatewayFeeCents: number;
        floristCompensationCents: number;
        floristBonificatoCents: number;
        netMarginCents: number;
        rowCount: number;
        receiptCount: number;
    };
    rows: TaxRegisterRow[];
};

type StripeInvoiceRow = {
    id: string;
    periodKey: string;
    number: string;
    issuedAt: string;
    totalFeeCents: number;
    taxableFeeCents: number;
    vatReverseChargeCents: number;
    hasPdf: boolean;
};

type PaypalFeeRow = {
    id: string;
    periodKey: string;
    number: string;
    issuedAt: string;
    totalFeeCents: number;
    taxableFeeCents: number;
    vatReverseChargeCents: number;
    txnCount: number;
    hasCsv: boolean;
};

function euro(cents: number): string {
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
    }).format(cents / 100);
}

function currentQuarter(): number {
    return Math.floor(new Date().getMonth() / 3) + 1;
}

function currentQuadrimester(): number {
    return Math.floor(new Date().getMonth() / 4) + 1;
}

export default function TaxQuarterlyPanel() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [mode, setMode] = useState<PeriodMode>('quarter');
    const [quarter, setQuarter] = useState(currentQuarter());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [quadrimester, setQuadrimester] = useState(currentQuadrimester());
    const [report, setReport] = useState<TaxRegisterReport | null>(null);
    const [stripeInvoices, setStripeInvoices] = useState<StripeInvoiceRow[]>([]);
    const [paypalFees, setPaypalFees] = useState<PaypalFeeRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [editRow, setEditRow] = useState<TaxRegisterRow | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        try {
            window.localStorage.setItem('floremoria.dossier.quarter', String(quarter));
            window.localStorage.setItem('floremoria.primaNota.period', `T${quarter}`);
        } catch {
            /* ignore */
        }
    }, [quarter]);

    const periodQuery =
        mode === 'quadrimester'
            ? `year=${year}&mode=quadrimester&quadrimester=${quadrimester}`
            : `year=${year}&mode=quarter&quarter=${
                  mode === 'month' ? Math.floor((month - 1) / 3) + 1 : quarter
              }`;

    const dossierQuery = () => {
        if (mode === 'month') {
            return `year=${year}&month=${month}&quarter=${Math.floor((month - 1) / 3) + 1}&format=xlsx`;
        }
        const q = mode === 'quarter' ? quarter : Math.min(4, Math.ceil(quadrimester * 1.34));
        return `year=${year}&quarter=${q}&format=xlsx`;
    };

    const loadReport = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const [regRes, taxRes] = await Promise.all([
                fetch(`/api/dashboard/finance/tax-register?${periodQuery}`),
                fetch(
                    `/api/dashboard/finance/tax-quarterly?year=${year}&quarter=${
                        mode === 'month'
                            ? Math.floor((month - 1) / 3) + 1
                            : mode === 'quarter'
                              ? quarter
                              : Math.ceil(quadrimester * 1.34)
                    }${mode === 'month' ? `&month=${month}` : ''}&format=json`
                ),
            ]);
            const regData = await regRes.json();
            if (!regData.ok) throw new Error(regData.error || 'Errore registro');
            setReport(regData.report);

            const taxData = await taxRes.json();
            if (taxData.ok && taxData.report?.stripeInvoices) {
                setStripeInvoices(taxData.report.stripeInvoices);
            } else {
                setStripeInvoices([]);
            }
            if (taxData.ok && taxData.report?.paypalMonthlyFees) {
                setPaypalFees(taxData.report.paypalMonthlyFees);
            } else {
                setPaypalFees([]);
            }
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Errore caricamento');
            setReport(null);
        } finally {
            setLoading(false);
        }
    }, [periodQuery, year, mode, quarter, month, quadrimester]);

    useEffect(() => {
        void loadReport();
    }, [loadReport]);

    const handleSyncStripe = async () => {
        setSyncing(true);
        setMessage(null);
        try {
            const res = await fetch('/api/dashboard/finance/stripe-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthsBack: 13 }),
            });
            const data = await res.json();
            if (!data.ok && !data.movementsUpserted) {
                throw new Error(data.error || 'Sync fallita');
            }
            setMessage(
                `Sync Stripe: ${data.movementsUpserted ?? 0} movimenti, ${data.payoutsUpserted ?? 0} payout, ${data.invoicesUpserted ?? 0} fatture.`
            );
            await loadReport();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Errore sync Stripe');
        } finally {
            setSyncing(false);
        }
    };

    const handleDownloadXlsx = async () => {
        setDownloading(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/dashboard/finance/tax-quarterly?${dossierQuery()}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Download fallito');
            }
            const blob = await res.blob();
            const cd = res.headers.get('Content-Disposition') || '';
            const match = cd.match(/filename="([^"]+)"/);
            const filename = match?.[1] || `FloreMoria_Dossier_Fiscale_${year}.xlsx`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setMessage('Dossier Fiscale Completo scaricato.');
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Errore download dossier');
        } finally {
            setDownloading(false);
        }
    };

    const handleDownloadZip = () => {
        window.open(
            `/api/dashboard/finance/download-receipts-zip?${periodQuery}&backfill=1`,
            '_blank'
        );
    };

    const handleSaveEdit = async () => {
        if (!editRow) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/dashboard/finance/tax-register', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: editRow.orderId,
                    floristCompensationCents: editRow.floristCompensationCents,
                    floristVatRate: editRow.floristVatRate,
                    floristSettlementStatus: editRow.settlementStatus,
                    accessoryAmountCents: editRow.accessoryGrossCents,
                    financeNotes: editRow.financeNotes,
                    paymentMethodLabel: editRow.gatewayLabel.split('·')[0]?.trim() || undefined,
                    grossCents: editRow.grossCents,
                    gatewayFeeCents: editRow.gatewayFeeCents,
                }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Salvataggio fallito');
            setEditRow(null);
            setMessage(`Ordine ${data.row.orderNumber} aggiornato.`);
            await loadReport();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Errore salvataggio');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                        Chiusura Trimestrale &amp; Fisco
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Registro unificato corrispettivi/liquidazioni, ricevute di cortesia (consegna
                        gratuita) e fatture Stripe.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value as PeriodMode)}
                        className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                        <option value="quarter">Trimestre fiscale</option>
                        <option value="month">Mese</option>
                        <option value="quadrimester">Quadrimestre</option>
                    </select>
                    {mode === 'quarter' ? (
                        <select
                            value={quarter}
                            onChange={(e) => setQuarter(Number(e.target.value))}
                            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                        >
                            <option value={1}>T1 {year} (Gen - Mar)</option>
                            <option value={2}>T2 {year} (Apr - Giu)</option>
                            <option value={3}>T3 {year} (Lug - Set)</option>
                            <option value={4}>T4 {year} (Ott - Dic)</option>
                        </select>
                    ) : mode === 'month' ? (
                        <select
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                        >
                            {[
                                'Gennaio',
                                'Febbraio',
                                'Marzo',
                                'Aprile',
                                'Maggio',
                                'Giugno',
                                'Luglio',
                                'Agosto',
                                'Settembre',
                                'Ottobre',
                                'Novembre',
                                'Dicembre',
                            ].map((label, i) => (
                                <option key={label} value={i + 1}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <select
                            value={quadrimester}
                            onChange={(e) => setQuadrimester(Number(e.target.value))}
                            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                        >
                            <option value={1}>QM1 Gen–Apr</option>
                            <option value={2}>QM2 Mag–Ago</option>
                            <option value={3}>QM3 Set–Dic</option>
                        </select>
                    )}
                    <input
                        type="number"
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="w-24 px-3 py-2 rounded-xl border border-slate-200 text-sm"
                        min={2024}
                        max={2100}
                    />
                    <button
                        type="button"
                        onClick={() => void loadReport()}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Aggiorna
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSyncStripe()}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <Landmark size={14} className={syncing ? 'animate-pulse' : ''} />
                        Sync Stripe
                    </button>
                    <button
                        type="button"
                        onClick={handleDownloadZip}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <Archive size={14} />
                        ZIP ricevute
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleDownloadXlsx()}
                        disabled={downloading}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1D6F42] text-white text-xs font-bold tracking-wide hover:bg-[#165a35] shadow-sm disabled:opacity-60"
                    >
                        <FileSpreadsheet size={15} className={downloading ? 'animate-pulse' : ''} />
                        {downloading ? 'Preparazione…' : 'Scarica Dossier Fiscale Completo (.xlsx)'}
                    </button>
                </div>
            </div>

            {message && (
                <div className="text-xs rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                    {message}
                </div>
            )}

            {loading && !report ? (
                <div className="py-16 text-center text-slate-400 text-sm">Caricamento prospetto…</div>
            ) : report ? (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <SummaryCard label="Totale incassato" value={euro(report.summary.grossCents)} />
                        <SummaryCard
                            label="Imponibile fiori 10%"
                            value={euro(report.summary.floralImponibileCents)}
                        />
                        <SummaryCard
                            label="IVA a debito"
                            value={euro(report.summary.ivaDebitoCents)}
                            accent
                        />
                        <SummaryCard
                            label="Margine netto periodo"
                            value={euro(report.summary.netMarginCents)}
                        />
                    </div>

                    <section className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Receipt size={16} className="text-[#c5a880]" />
                                <h4 className="text-sm font-semibold text-slate-800">
                                    Registro economico &amp; corrispettivi ({report.summary.rowCount})
                                </h4>
                            </div>
                            <span className="text-[10px] uppercase tracking-wide text-slate-500">
                                Ricevute archiviate: {report.summary.receiptCount}
                            </span>
                        </div>
                        <div className="dashboard-table-scroll overflow-x-auto">
                            <table className="w-full text-left text-xs min-w-[1280px]">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100 bg-white">
                                        <th className="px-3 py-2">Data</th>
                                        <th className="px-3 py-2">Codice</th>
                                        <th className="px-3 py-2">Cliente</th>
                                        <th className="px-3 py-2 text-right">Totale</th>
                                        <th className="px-3 py-2 text-right">Imp. 10%</th>
                                        <th className="px-3 py-2 text-right">Imp. 22%</th>
                                        <th className="px-3 py-2 text-right">Debito IVA</th>
                                        <th className="px-3 py-2">Gateway &amp; Fee</th>
                                        <th className="px-3 py-2">Fiorista</th>
                                        <th className="px-3 py-2 text-right">Compenso</th>
                                        <th className="px-3 py-2">Liquidazione</th>
                                        <th className="px-3 py-2 text-right">Margine</th>
                                        <th className="px-3 py-2">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {report.rows.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={13}
                                                className="px-4 py-10 text-center text-slate-400 italic"
                                            >
                                                Nessun ordine nel periodo selezionato.
                                            </td>
                                        </tr>
                                    ) : (
                                        report.rows.map((r) => (
                                            <tr key={r.orderId} className="hover:bg-slate-50/60">
                                                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                                                <td className="px-3 py-2 font-mono">{r.orderNumber}</td>
                                                <td className="px-3 py-2 max-w-[140px] truncate">
                                                    {r.buyerName}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">
                                                    {euro(r.grossCents)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">
                                                    {euro(r.floralImponibileCents)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">
                                                    {euro(r.accessoryImponibileCents)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">
                                                    {euro(r.ivaDebitoCents)}
                                                </td>
                                                <td className="px-3 py-2 text-[11px] max-w-[160px]">
                                                    {r.gatewayLabel}
                                                </td>
                                                <td className="px-3 py-2 max-w-[120px] truncate">
                                                    {r.floristName}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">
                                                    {euro(r.floristCompensationCents)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <SettlementBadge status={r.settlementStatus} />
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">
                                                    {euro(r.netMarginCents)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditRow({ ...r })}
                                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8b6914] hover:underline"
                                                    >
                                                        <Pencil size={12} />
                                                        Modifica
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <section className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                            <Landmark size={16} className="text-[#c5a880]" />
                            <h4 className="text-sm font-semibold text-slate-800">
                                Fatture Mensili Stripe (commissioni)
                            </h4>
                        </div>
                        <div className="dashboard-table-scroll overflow-x-auto">
                            <table className="w-full text-left text-sm min-w-[520px]">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                                        <th className="px-4 py-2">Periodo</th>
                                        <th className="px-4 py-2">Numero</th>
                                        <th className="px-4 py-2">Emissione</th>
                                        <th className="px-4 py-2 text-right">Fee</th>
                                        <th className="px-4 py-2 text-right">IVA RC 22%</th>
                                        <th className="px-4 py-2">PDF</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stripeInvoices.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="px-4 py-8 text-center text-slate-400 italic"
                                            >
                                                Nessuna fattura Stripe nel periodo. Esegui Sync Stripe.
                                            </td>
                                        </tr>
                                    ) : (
                                        stripeInvoices.map((inv) => (
                                            <tr key={inv.id} className="hover:bg-slate-50/60">
                                                <td className="px-4 py-2 font-mono text-xs">
                                                    {inv.periodKey}
                                                </td>
                                                <td className="px-4 py-2">{inv.number}</td>
                                                <td className="px-4 py-2">{inv.issuedAt}</td>
                                                <td className="px-4 py-2 text-right font-mono">
                                                    {euro(inv.totalFeeCents)}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono">
                                                    {euro(inv.vatReverseChargeCents)}
                                                </td>
                                                <td className="px-4 py-2">
                                                    {inv.hasPdf ? (
                                                        <a
                                                            href={`/api/dashboard/finance/stripe-invoices/${inv.id}/pdf`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#8b6914] hover:underline"
                                                        >
                                                            <FileText size={12} />
                                                            PDF
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Landmark size={16} className="text-sky-600" />
                                <h4 className="text-sm font-semibold text-slate-800">
                                    Fatture Mensili PayPal (commissioni)
                                </h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleDownloadXlsx()}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1D6F42] hover:underline"
                            >
                                <FileSpreadsheet size={12} />
                                Incluso nel Dossier .xlsx
                            </button>
                        </div>
                        <div className="dashboard-table-scroll overflow-x-auto">
                            <table className="w-full text-left text-sm min-w-[520px]">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                                        <th className="px-4 py-2">Periodo</th>
                                        <th className="px-4 py-2">Numero</th>
                                        <th className="px-4 py-2">Fine</th>
                                        <th className="px-4 py-2 text-right">N. TX</th>
                                        <th className="px-4 py-2 text-right">Fee</th>
                                        <th className="px-4 py-2 text-right">IVA RC 22%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paypalFees.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="px-4 py-8 text-center text-slate-400 italic"
                                            >
                                                Nessuna commissione PayPal aggregata nel periodo.
                                            </td>
                                        </tr>
                                    ) : (
                                        <>
                                            {paypalFees.map((inv) => (
                                                <tr key={inv.id} className="hover:bg-slate-50/60">
                                                    <td className="px-4 py-2 font-mono text-xs">
                                                        {inv.periodKey}
                                                    </td>
                                                    <td className="px-4 py-2">{inv.number}</td>
                                                    <td className="px-4 py-2">{inv.issuedAt}</td>
                                                    <td className="px-4 py-2 text-right font-mono">
                                                        {inv.txnCount}
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono text-rose-700">
                                                        {euro(inv.totalFeeCents)}
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono">
                                                        {euro(inv.vatReverseChargeCents)}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-50 font-semibold">
                                                <td className="px-4 py-2" colSpan={4}>
                                                    Totale fee PayPal periodo
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono text-rose-800">
                                                    {euro(
                                                        paypalFees.reduce(
                                                            (s, r) => s + r.totalFeeCents,
                                                            0
                                                        )
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono">
                                                    {euro(
                                                        paypalFees.reduce(
                                                            (s, r) => s + r.vatReverseChargeCents,
                                                            0
                                                        )
                                                    )}
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                    </div>
                </>
            ) : null}

            {editRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
                        <h4 className="text-base font-semibold text-slate-900">
                            Modifica riga — {editRow.orderNumber}
                            {editRow.hasReceipt ? (
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                                    Allineata a ricevuta
                                </span>
                            ) : null}
                        </h4>
                        <label className="block text-xs font-semibold text-slate-600">
                            Lordo incassato (€)
                            <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={(editRow.grossCents / 100).toFixed(2)}
                                onChange={(e) =>
                                    setEditRow({
                                        ...editRow,
                                        grossCents: Math.round(Number(e.target.value || 0) * 100),
                                    })
                                }
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                            />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                            Fee gateway (€)
                            <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={(editRow.gatewayFeeCents / 100).toFixed(2)}
                                onChange={(e) =>
                                    setEditRow({
                                        ...editRow,
                                        gatewayFeeCents: Math.round(
                                            Number(e.target.value || 0) * 100
                                        ),
                                    })
                                }
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                            />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                            Compenso fiorista (€)
                            <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={(editRow.floristCompensationCents / 100).toFixed(2)}
                                onChange={(e) =>
                                    setEditRow({
                                        ...editRow,
                                        floristCompensationCents: Math.round(
                                            Number(e.target.value || 0) * 100
                                        ),
                                    })
                                }
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                            />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                            Aliquota IVA fiorista (0 = forfettario, 0.10, 0.22)
                            <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={1}
                                value={editRow.floristVatRate ?? ''}
                                onChange={(e) =>
                                    setEditRow({
                                        ...editRow,
                                        floristVatRate:
                                            e.target.value === ''
                                                ? null
                                                : Number(e.target.value),
                                    })
                                }
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                                placeholder="opzionale"
                            />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                            Accessori lordi IVA 22% (€)
                            <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={(editRow.accessoryGrossCents / 100).toFixed(2)}
                                onChange={(e) =>
                                    setEditRow({
                                        ...editRow,
                                        accessoryGrossCents: Math.round(
                                            Number(e.target.value || 0) * 100
                                        ),
                                    })
                                }
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                            />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                            Stato liquidazione
                            <select
                                value={editRow.settlementStatus}
                                onChange={(e) =>
                                    setEditRow({
                                        ...editRow,
                                        settlementStatus: e.target.value as SettlementStatus,
                                    })
                                }
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                            >
                                <option value="PENDING">Pending</option>
                                <option value="BONIFICATO">Bonificato</option>
                                <option value="RICEVUTA">Ricevuta</option>
                            </select>
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                            Note
                            <textarea
                                value={editRow.financeNotes || ''}
                                onChange={(e) =>
                                    setEditRow({ ...editRow, financeNotes: e.target.value })
                                }
                                rows={3}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                            />
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setEditRow(null)}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void handleSaveEdit()}
                                className="px-4 py-2 rounded-xl bg-[#c5a880] text-white text-xs font-bold uppercase tracking-wide disabled:opacity-60"
                            >
                                {saving ? 'Salvataggio…' : 'Salva su Neon'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SettlementBadge({ status }: { status: SettlementStatus }) {
    const cls =
        status === 'BONIFICATO'
            ? 'text-emerald-700 bg-emerald-50'
            : status === 'RICEVUTA'
              ? 'text-sky-700 bg-sky-50'
              : 'text-amber-700 bg-amber-50';
    return (
        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${cls}`}>
            {status === 'BONIFICATO'
                ? 'Bonificato'
                : status === 'RICEVUTA'
                  ? 'Ricevuta'
                  : 'Pending'}
        </span>
    );
}

function SummaryCard({
    label,
    value,
    accent,
}: {
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <div
            className={`rounded-2xl border p-4 ${
                accent ? 'border-[#c5a880]/60 bg-[#faf6f0]' : 'border-slate-200 bg-white'
            }`}
        >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-bold font-mono text-slate-900">{value}</div>
        </div>
    );
}
