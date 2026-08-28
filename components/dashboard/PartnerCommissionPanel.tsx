'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    formatPartnerCommissionEuros,
} from '@/lib/pricing/calculatePartnerCommission';
import type { PartnerCommissionSummary } from '@/lib/financial/partnerCommissionRegister';

type Props = {
    partnerId: string;
    partnerName: string;
    initialSummary: PartnerCommissionSummary;
};

function formatEuros(cents: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDate(d: Date | string | null): string {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('it-IT');
}

export default function PartnerCommissionPanel({ partnerId, partnerName, initialSummary }: Props) {
    const [summary, setSummary] = useState(initialSummary);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const pendingOrders = useMemo(
        () => summary.orders.filter((o) => o.partnerCommissionSettlementStatus === 'PENDING'),
        [summary.orders]
    );

    const settlementLabel =
        summary.pendingCommissionCents > 0 ? 'Da Liquidare' : 'Saldato';

    const settleMonth = async () => {
        setBusy(true);
        try {
            const res = await fetch(`/api/dashboard/partners/${partnerId}/commissions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'settle_pending' }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Operazione fallita');

            setSummary((prev) => ({
                ...prev,
                pendingCommissionCents: 0,
                settledCommissionCents: prev.totalCommissionCents,
                orders: prev.orders.map((o) =>
                    o.partnerCommissionSettlementStatus === 'PENDING'
                        ? { ...o, partnerCommissionSettlementStatus: 'LIQUIDATO' as const }
                        : o
                ),
            }));
            setToast(`Liquidati ${data.updated} ordini per ${partnerName}.`);
        } catch (e) {
            setToast(e instanceof Error ? e.message : 'Errore liquidazione');
        } finally {
            setBusy(false);
            setTimeout(() => setToast(null), 4000);
        }
    };

    return (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Riepilogo Compensi &amp; Fee Maturate</h2>
                    <p className="text-sm text-gray-500">Provvigione 10% sul lordo ordine (IVA compresa) — {partnerName}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            settlementLabel === 'Da Liquidare'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                    >
                        {settlementLabel}
                    </span>
                    {pendingOrders.length > 0 ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void settleMonth()}
                            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                            Segna come liquidato
                        </button>
                    ) : null}
                </div>
            </div>

            {toast ? (
                <div className="mx-5 mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {toast}
                </div>
            ) : null}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5">
                <KpiCard label="Totale Ordini" value={String(summary.totalOrders)} />
                <KpiCard label="Volume Vendite" value={formatEuros(summary.totalSalesCents)} />
                <KpiCard label="Fee Totale Maturata" value={formatEuros(summary.totalCommissionCents)} />
                <KpiCard label="Fee Mese Corrente" value={formatEuros(summary.currentMonthCommissionCents)} />
                <KpiCard label="Fee Da Liquidare" value={formatEuros(summary.pendingCommissionCents)} />
            </div>

            <div className="overflow-x-auto border-t border-gray-100">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-4 py-3">Data</th>
                            <th className="px-4 py-3">Codice Ordine</th>
                            <th className="px-4 py-3">Defunto &amp; Luogo</th>
                            <th className="px-4 py-3">Importo Lordo</th>
                            <th className="px-4 py-3">Quota 10%</th>
                            <th className="px-4 py-3">Stato Ordine</th>
                            <th className="px-4 py-3">Liquidazione Fee</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summary.orders.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                    Nessun ordine collegato a questo partner/agenzia.
                                </td>
                            </tr>
                        ) : (
                            summary.orders.map((o) => (
                                <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/dashboard/orders?open=${encodeURIComponent(o.id)}`}
                                            className="font-semibold text-gray-900 hover:underline"
                                        >
                                            {o.orderNumber || o.id.slice(0, 8)}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-gray-900">{o.deceasedName}</div>
                                        <div className="text-xs text-gray-500">
                                            {o.cemeteryName} — {o.cemeteryCity}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">{formatEuros(o.totalPriceCents)}</td>
                                    <td className="px-4 py-3 font-semibold text-amber-800">
                                        {formatPartnerCommissionEuros(o.partnerCommissionCents)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-medium text-gray-700">{o.status}</span>
                                        <div className="text-[11px] text-gray-500">{o.partnerPaymentStatus}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                o.partnerCommissionSettlementStatus === 'LIQUIDATO'
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : 'bg-amber-50 text-amber-700'
                                            }`}
                                        >
                                            {o.partnerCommissionSettlementStatus === 'LIQUIDATO'
                                                ? 'Saldato'
                                                : 'Da Liquidare'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function KpiCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
            <div className="mt-1 text-lg font-bold text-gray-900">{value}</div>
        </div>
    );
}
