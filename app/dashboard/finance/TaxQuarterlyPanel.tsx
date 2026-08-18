'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
    Download,
    FileText,
    RefreshCw,
    Landmark,
    Receipt,
} from 'lucide-react';

type TaxQuarter = 1 | 2 | 3 | 4;

type TaxReport = {
    bounds: { year: number; quarter: TaxQuarter; label: string };
    summary: {
        corrispettiviLordoCents: number;
        corrispettiviImponibileCents: number;
        ivaDebito10Cents: number;
        gatewayFeesCents: number;
        stripeInvoicesTotalCents: number;
        floristCompensiCents: number;
        floristPaidCents: number;
    };
    corrispettivi: Array<{
        orderNumber: string;
        date: string;
        buyerName: string;
        grossCents: number;
        imponibileCents: number;
        ivaDebitoCents: number;
        gatewayFeeCents: number;
        transactionId: string;
    }>;
    stripeInvoices: Array<{
        id: string;
        periodKey: string;
        number: string;
        issuedAt: string;
        totalFeeCents: number;
        taxableFeeCents: number;
        vatReverseChargeCents: number;
        vendorName: string;
        hasPdf: boolean;
    }>;
    floristLiquidazioni: Array<{
        orderNumber: string;
        date: string;
        partnerName: string;
        compensoConcordatoCents: number;
        bonificoInviato: boolean;
        fatturaPassivaStato: string;
    }>;
};

function euro(cents: number): string {
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
    }).format(cents / 100);
}

function currentQuarter(): TaxQuarter {
    return (Math.floor(new Date().getMonth() / 3) + 1) as TaxQuarter;
}

export default function TaxQuarterlyPanel() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [quarter, setQuarter] = useState<TaxQuarter>(currentQuarter());
    const [report, setReport] = useState<TaxReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const loadReport = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/tax-quarterly?year=${year}&quarter=${quarter}&format=json`
            );
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Errore report');
            setReport(data.report);
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Errore caricamento');
            setReport(null);
        } finally {
            setLoading(false);
        }
    }, [year, quarter]);

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

    const handleDownloadCsv = () => {
        window.open(
            `/api/dashboard/finance/tax-quarterly?year=${year}&quarter=${quarter}&format=csv`,
            '_blank'
        );
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                        Chiusura Trimestrale &amp; Fisco
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Corrispettivi IVA 10% floreale, fatture Stripe (reverse charge) e liquidazioni fioristi.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={quarter}
                        onChange={(e) => setQuarter(Number(e.target.value) as TaxQuarter)}
                        className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                        <option value={1}>Q1 (gen–mar)</option>
                        <option value={2}>Q2 (apr–giu)</option>
                        <option value={3}>Q3 (lug–set)</option>
                        <option value={4}>Q4 (ott–dic)</option>
                    </select>
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
                        onClick={handleDownloadCsv}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c5a880] text-white text-xs font-bold uppercase tracking-wide hover:bg-[#b8976e]"
                    >
                        <Download size={14} />
                        Scarica Prospetto Fiscale Commercialista (CSV / Excel)
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
                        <SummaryCard
                            label="Lordo corrispettivi"
                            value={euro(report.summary.corrispettiviLordoCents)}
                        />
                        <SummaryCard
                            label="Imponibile IVA 10%"
                            value={euro(report.summary.corrispettiviImponibileCents)}
                        />
                        <SummaryCard
                            label="IVA a debito 10%"
                            value={euro(report.summary.ivaDebito10Cents)}
                            accent
                        />
                        <SummaryCard
                            label="Fee gateway / Stripe"
                            value={euro(
                                Math.max(
                                    report.summary.gatewayFeesCents,
                                    report.summary.stripeInvoicesTotalCents
                                )
                            )}
                        />
                    </div>

                    <section className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                            <Receipt size={16} className="text-[#c5a880]" />
                            <h4 className="text-sm font-semibold text-slate-800">
                                Fatture Mensili Stripe (commissioni)
                            </h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm min-w-[720px]">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                                        <th className="px-4 py-2">Periodo</th>
                                        <th className="px-4 py-2">Numero</th>
                                        <th className="px-4 py-2">Emissione</th>
                                        <th className="px-4 py-2 text-right">Fee</th>
                                        <th className="px-4 py-2 text-right">Imponibile</th>
                                        <th className="px-4 py-2 text-right">IVA RC 22%</th>
                                        <th className="px-4 py-2">PDF</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {report.stripeInvoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
                                                Nessuna fattura Stripe nel trimestre. Esegui Sync Stripe.
                                            </td>
                                        </tr>
                                    ) : (
                                        report.stripeInvoices.map((inv) => (
                                            <tr key={inv.id} className="hover:bg-slate-50/60">
                                                <td className="px-4 py-2 font-mono text-xs">{inv.periodKey}</td>
                                                <td className="px-4 py-2">{inv.number}</td>
                                                <td className="px-4 py-2">{inv.issuedAt}</td>
                                                <td className="px-4 py-2 text-right font-mono">
                                                    {euro(inv.totalFeeCents)}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono">
                                                    {euro(inv.taxableFeeCents)}
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
                                                            Scarica PDF Fattura Stripe
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">
                                                            Aggregata (no PDF API)
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid lg:grid-cols-2 gap-4">
                        <section className="rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                <h4 className="text-sm font-semibold text-slate-800">
                                    Corrispettivi ({report.corrispettivi.length})
                                </h4>
                            </div>
                            <div className="max-h-72 overflow-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="text-[10px] uppercase text-slate-500 border-b">
                                            <th className="px-3 py-2">Data</th>
                                            <th className="px-3 py-2">Ordine</th>
                                            <th className="px-3 py-2 text-right">Lordo</th>
                                            <th className="px-3 py-2 text-right">IVA 10%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {report.corrispettivi.slice(0, 40).map((r) => (
                                            <tr key={r.orderNumber + r.date}>
                                                <td className="px-3 py-1.5">{r.date}</td>
                                                <td className="px-3 py-1.5 font-mono">{r.orderNumber}</td>
                                                <td className="px-3 py-1.5 text-right font-mono">
                                                    {euro(r.grossCents)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono">
                                                    {euro(r.ivaDebitoCents)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                <h4 className="text-sm font-semibold text-slate-800">
                                    Liquidazioni fioristi ({report.floristLiquidazioni.length})
                                </h4>
                            </div>
                            <div className="max-h-72 overflow-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="text-[10px] uppercase text-slate-500 border-b">
                                            <th className="px-3 py-2">Ordine</th>
                                            <th className="px-3 py-2">Fiorista</th>
                                            <th className="px-3 py-2 text-right">Compenso</th>
                                            <th className="px-3 py-2">Stato</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {report.floristLiquidazioni.slice(0, 40).map((r) => (
                                            <tr key={r.orderNumber}>
                                                <td className="px-3 py-1.5 font-mono">{r.orderNumber}</td>
                                                <td className="px-3 py-1.5">{r.partnerName}</td>
                                                <td className="px-3 py-1.5 text-right font-mono">
                                                    {euro(r.compensoConcordatoCents)}
                                                </td>
                                                <td className="px-3 py-1.5">
                                                    <span
                                                        className={
                                                            r.bonificoInviato
                                                                ? 'text-emerald-600'
                                                                : 'text-amber-600'
                                                        }
                                                    >
                                                        {r.fatturaPassivaStato}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                </>
            ) : null}
        </div>
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
