'use client';

import { useMemo } from 'react';
import {
    TrendingUp,
    Users,
    CreditCard,
    Repeat,
    ShoppingBag,
    Award,
    Clock,
    Tag,
    Layers,
    Share2,
    Calendar,
    ChevronRight,
    Sparkles,
} from 'lucide-react';
import { UserRow } from '@/lib/users/unifiedUsers';
import { computeUserSalesAnalytics } from '@/lib/users/userSalesAnalytics';

const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
};

const formatITDateShort = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function UserSalesAnalytics({
    users,
    orders,
}: {
    users: UserRow[];
    orders: any[];
}) {
    const analytics = useMemo(() => computeUserSalesAnalytics(users, orders), [users, orders]);
    const { kpis, top5Clients, topProducts, serviceBreakdown, channelsAndBehavior } = analytics;

    return (
        <div className="mt-14 space-y-8 animate-in fade-in duration-300">
            {/* Header Sezione */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-5">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                            <TrendingUp size={18} />
                        </span>
                        <h2 className="text-xl font-display font-bold text-gray-900 tracking-tight">
                            Analytics & Metriche Vendite Utenti
                        </h2>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                        Cruscotto reattivo di analisi anagrafiche unificate, fedeltà d'acquisto e preferenze di prodotto.
                    </p>
                </div>
                <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                    <Sparkles size={13} className="text-fm-gold" />
                    <span>Dati consolidati in tempo reale</span>
                </div>
            </div>

            {/* 1. KPI Cards Generali */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Clienti Totali */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-xs font-bold uppercase tracking-wider">Clienti Totali</span>
                        <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                            <Users size={15} />
                        </span>
                    </div>
                    <div>
                        <div className="text-2xl font-bold font-mono text-gray-900">{kpis.totalClients}</div>
                        <div className="text-[11px] text-gray-500 font-medium mt-0.5 flex items-center gap-1">
                            <span className="text-emerald-600 font-bold">{kpis.payingClients}</span> con ordini attivi
                        </div>
                    </div>
                    <div className="pt-2 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-400">
                        <span>Reg: {kpis.registeredClients}</span>
                        <span>Guest: {kpis.guestClients}</span>
                    </div>
                </div>

                {/* Valore Medio Ordine (AOV) */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-xs font-bold uppercase tracking-wider">AOV (Valore Medio)</span>
                        <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                            <CreditCard size={15} />
                        </span>
                    </div>
                    <div>
                        <div className="text-2xl font-bold font-mono text-gray-900">
                            {formatCurrency(kpis.aovEur)}
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium mt-0.5">
                            Spesa media per carrello
                        </div>
                    </div>
                    <div className="pt-2 border-t border-gray-50 text-[10px] text-gray-400">
                        Totale Ordini: <strong className="text-gray-700">{kpis.totalOrdersCount}</strong>
                    </div>
                </div>

                {/* Tasso di Riordino / Retention */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-xs font-bold uppercase tracking-wider">Retention Rate</span>
                        <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                            <Repeat size={15} />
                        </span>
                    </div>
                    <div>
                        <div className="text-2xl font-bold font-mono text-purple-700">
                            {kpis.retentionRatePercent}%
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium mt-0.5">
                            Clienti con ≥ 2 ordini
                        </div>
                    </div>
                    <div className="pt-2 border-t border-gray-50 text-[10px] text-gray-400">
                        <strong className="text-purple-900">{kpis.repeatCustomersCount}</strong> clienti fidelizzati
                    </div>
                </div>

                {/* LTV Medio */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-xs font-bold uppercase tracking-wider">LTV Medio Cliente</span>
                        <span className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
                            <TrendingUp size={15} />
                        </span>
                    </div>
                    <div>
                        <div className="text-2xl font-bold font-mono text-gray-900">
                            {formatCurrency(kpis.ltvEur)}
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium mt-0.5">
                            Fatturato medio per cliente
                        </div>
                    </div>
                    <div className="pt-2 border-t border-gray-50 text-[10px] text-gray-400">
                        Fatturato Totale: <strong className="text-gray-700">{formatCurrency(kpis.totalRevenueEur)}</strong>
                    </div>
                </div>

                {/* Distribuzione Registrati vs Guest */}
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-xs font-bold uppercase tracking-wider">Registrati vs Guest</span>
                        <span className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
                            <ShoppingBag size={15} />
                        </span>
                    </div>
                    <div>
                        <div className="text-xl font-bold font-mono text-slate-800">
                            {Math.round((kpis.registeredClients / (kpis.totalClients || 1)) * 100)}% <span className="text-xs text-gray-400 font-normal">reg.</span>
                        </div>
                        {/* Barra di ripartizione */}
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden flex mt-2">
                            <div
                                style={{ width: `${(kpis.registeredClients / (kpis.totalClients || 1)) * 100}%` }}
                                className="bg-black h-full"
                                title="Registrati"
                            />
                            <div
                                style={{ width: `${(kpis.guestClients / (kpis.totalClients || 1)) * 100}%` }}
                                className="bg-slate-300 h-full"
                                title="Guest"
                            />
                        </div>
                    </div>
                    <div className="pt-2 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-500">
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-black inline-block" /> {kpis.registeredClients} Account
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" /> {kpis.guestClients} Guest
                        </span>
                    </div>
                </div>
            </div>

            {/* 2. Top 5 Migliori Clienti (Leaderboard) */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                            <Award size={18} />
                        </span>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Top 5 Migliori Clienti per Spesa Complessiva</h3>
                            <p className="text-xs text-gray-500">Classifica unificata degli acquirenti con maggior valore e fedeltà storica.</p>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="bg-gray-50/60 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider">
                                <th className="px-4 py-3 text-center w-12">#</th>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3 text-right">Spesa Totale</th>
                                <th className="px-4 py-3 text-center">Ordini</th>
                                <th className="px-4 py-3">Ultimo Ordine</th>
                                <th className="px-4 py-3">Prodotto Preferito</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {top5Clients.map((c) => {
                                let badgeClass = 'bg-slate-100 text-slate-700';
                                let medalIcon = null;
                                if (c.rank === 1) {
                                    badgeClass = 'bg-amber-100 text-amber-900 border border-amber-300 font-extrabold';
                                    medalIcon = '🥇';
                                } else if (c.rank === 2) {
                                    badgeClass = 'bg-slate-200 text-slate-800 font-bold';
                                    medalIcon = '🥈';
                                } else if (c.rank === 3) {
                                    badgeClass = 'bg-amber-50 text-amber-800 font-bold';
                                    medalIcon = '🥉';
                                }

                                return (
                                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3.5 text-center">
                                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${badgeClass}`}>
                                                {medalIcon ? medalIcon : `#${c.rank}`}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <div className="font-bold text-gray-900 text-sm leading-tight">
                                                {c.name}
                                            </div>
                                            <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                                                {c.email || c.phone || c.id}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-right font-mono font-bold text-sm text-gray-900">
                                            {formatCurrency(c.totalSpentEur)}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded-full font-mono font-bold text-xs">
                                                {c.ordersCount}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-gray-600 font-mono text-[11px] whitespace-nowrap">
                                            {formatITDateShort(c.lastOrderDate)}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200/60 rounded-lg text-xs font-semibold">
                                                <Tag size={11} className="text-amber-600" />
                                                <span className="truncate max-w-[200px]">{c.preferredProduct}</span>
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 3. Preferenze Prodotti & Ripartizione Servizio */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Prodotti Più Acquistati (7 col) */}
                <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                                <ShoppingBag size={16} />
                            </span>
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                                Prodotti Più Venduti & Incidenza Fatturato
                            </h3>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {topProducts.map((p, idx) => (
                            <div key={idx} className="p-3 bg-gray-50/50 rounded-xl border border-gray-100 space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-900">{p.name}</span>
                                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-white border border-gray-200 text-gray-500 rounded">
                                            {p.category}
                                        </span>
                                    </div>
                                    <div className="font-mono font-bold text-gray-900">
                                        {formatCurrency(p.revenueEur)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-gray-500">
                                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                        <div
                                            style={{ width: `${Math.min(p.sharePercent * 2.5, 100)}%` }}
                                            className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                                        />
                                    </div>
                                    <span className="font-mono font-semibold text-emerald-700 shrink-0">
                                        {p.sharePercent}%
                                    </span>
                                    <span className="shrink-0 text-gray-400">
                                        ({p.quantity} pz)
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Ripartizione Tipologia Servizio & Comportamento Canali (5 col) */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Ripartizione Servizio FT vs FF vs Altro */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                <Layers size={16} />
                            </span>
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                                Tipologia di Servizio
                            </h3>
                        </div>

                        <div className="space-y-3 text-xs">
                            {/* FT: Fiori sulle Tombe */}
                            <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100 space-y-1">
                                <div className="flex justify-between items-center font-semibold text-gray-900">
                                    <span>🕊️ {serviceBreakdown.fioriTombe.label} (FT)</span>
                                    <span className="font-mono font-bold text-blue-900">
                                        {formatCurrency(serviceBreakdown.fioriTombe.revenueEur)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-blue-800">
                                    <span>{serviceBreakdown.fioriTombe.count} ordini</span>
                                    <span className="font-bold">{serviceBreakdown.fioriTombe.sharePercent}% del fatturato</span>
                                </div>
                            </div>

                            {/* FF: Per il Funerale */}
                            <div className="p-3 bg-purple-50/40 rounded-xl border border-purple-100 space-y-1">
                                <div className="flex justify-between items-center font-semibold text-gray-900">
                                    <span>⛪ {serviceBreakdown.perFunerale.label} (FF)</span>
                                    <span className="font-mono font-bold text-purple-900">
                                        {formatCurrency(serviceBreakdown.perFunerale.revenueEur)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-purple-800">
                                    <span>{serviceBreakdown.perFunerale.count} ordini</span>
                                    <span className="font-bold">{serviceBreakdown.perFunerale.sharePercent}% del fatturato</span>
                                </div>
                            </div>

                            {/* Ricorrenze / Accessori */}
                            <div className="p-3 bg-amber-50/40 rounded-xl border border-amber-100 space-y-1">
                                <div className="flex justify-between items-center font-semibold text-gray-900">
                                    <span>🕯️ {serviceBreakdown.altreRicorrenze.label}</span>
                                    <span className="font-mono font-bold text-amber-900">
                                        {formatCurrency(serviceBreakdown.altreRicorrenze.revenueEur)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-amber-800">
                                    <span>{serviceBreakdown.altreRicorrenze.count} ordini</span>
                                    <span className="font-bold">{serviceBreakdown.altreRicorrenze.sharePercent}% del fatturato</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Canali & Tempo Medio di Riordino */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
                                <Clock size={16} />
                            </span>
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                                Comportamento & Canali
                            </h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {/* Intervallo Medio Riordino */}
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Intervallo Riordino (1° ➔ 2°)
                                </div>
                                <div className="text-xl font-bold font-mono text-slate-900">
                                    {channelsAndBehavior.avgDaysBetweenFirstAndSecondOrder !== null
                                        ? `${channelsAndBehavior.avgDaysBetweenFirstAndSecondOrder} gg`
                                        : '—'}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                    Media clienti ricorrenti
                                </div>
                            </div>

                            {/* Incidenza Diretta vs Partner */}
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Ordini Diretti vs Partner
                                </div>
                                <div className="text-xl font-bold font-mono text-slate-900">
                                    {channelsAndBehavior.direct.sharePercent}% <span className="text-xs text-gray-400 font-normal">dir.</span>
                                </div>
                                <div className="text-[10px] text-slate-400">
                                    {channelsAndBehavior.direct.count} diretti / {channelsAndBehavior.partner.count} partner
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
