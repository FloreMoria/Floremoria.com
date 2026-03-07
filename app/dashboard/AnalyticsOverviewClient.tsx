'use client';

import React, { useState, useEffect } from 'react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, CartesianAxis
} from 'recharts';
import { AreaChart, Area } from 'recharts';
import { Activity, Users, MousePointerClick, Clock, ArrowUpRight, BarChart2, Moon, Sun, Euro, ShieldCheck } from 'lucide-react';

export default function AnalyticsOverviewClient({ ga4Data, initialOrders = [], csvData = [] }: { ga4Data: any, initialOrders?: any[], csvData?: any[] }) {
    const [darkMode, setDarkMode] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            // setDarkMode(true);
        }
    }, []);

    const bgClass = darkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900';
    const cardClass = darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
    const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

    if (!isMounted) return null;

    if (!ga4Data || ga4Data.isEmpty) {
        return (
            <div className={`-m-8 p-8 min-h-screen transition-colors duration-300 ${bgClass} flex flex-col items-center justify-center`}>
                <div className="w-16 h-16 border-4 border-fm-cta/20 border-t-fm-cta rounded-full animate-spin mb-6"></div>
                <h2 className="text-2xl font-display font-bold mb-2">In attesa di dati da Google...</h2>
                <p className={`${textMuted} text-center max-w-md`}>La proprietà Google Analytics ({process.env.NEXT_PUBLIC_GA4_PROPERTY_ID || 'G-K00DQKQXFC'}) potrebbe essere appena stata creata o non avere ancora registrato traffico nelle ultime ore.</p>
            </div>
        );
    }

    const { totals, dailyTraffic, topPages } = ga4Data;

    // THE MARGIN ENGINE
    const costiFioristaMap = new Map();
    csvData.forEach((row: any) => {
        if (row.Prodotto && row['Compenso Fiorista']) {
            costiFioristaMap.set(row.Prodotto.toLowerCase(), parseFloat(row['Compenso Fiorista']));
        }
    });

    // We store partial margins to display some badges on the UI, but we mostly need `totalMarginCents`
    let totalMarginCents = 0;

    // We will collect active orders here to show the badge breakdown
    const recentMarginOrders: any[] = [];

    function calculateNetProfit(orderType: string, itemName: string, priceCents: number, isReferral: boolean, quantity: number) {
        const isAccessory = ['lumino', 'nastro', 'messaggio', 'biglietto', 'ceri'].some(kw => itemName.toLowerCase().includes(kw));

        const baseTotal = priceCents * quantity;
        let itemMargin = 0;
        let isFullMargin = false;
        let hasPartnerCommission = false;

        if (isAccessory) {
            // SECURITY LOGIC: Margine Pieno per gli accessori
            itemMargin = baseTotal;
            isFullMargin = true;
        } else {
            let costFioristaCents = 0;
            let foundCost = false;
            for (let [key, val] of costiFioristaMap.entries()) {
                if (itemName.toLowerCase().includes(key)) {
                    costFioristaCents = (val * 100) * quantity;
                    foundCost = true;
                    break;
                }
            }
            if (!foundCost) {
                costFioristaCents = Math.round(baseTotal * 0.65); // Fallback estimate
            }
            itemMargin = baseTotal - costFioristaCents;
        }

        // Commissione Partner 10% on FF from Referral (only on non-accessories)
        if (!isAccessory && orderType === 'FF' && isReferral) {
            const feeEuros = Math.ceil((baseTotal / 100) * 0.10); // Arrotondamento all'Euro superiore
            const referralFeeCents = feeEuros * 100;
            itemMargin -= referralFeeCents;
            hasPartnerCommission = true;
        }

        return { itemMargin, isFullMargin, hasPartnerCommission };
    }

    initialOrders.forEach(order => {
        if (order.status === 'CANCELLED') return;

        const isFF = order.orderNumber?.startsWith('FF');
        const isReferralAnnunci = order.additionalInstructions?.includes('Annuncifunebri');
        const prefix = order.orderNumber?.substring(0, 2) || 'FT';

        let orderMarginCents = 0;
        let orderHasFullMarginItems = false;
        let orderHasCommission = false;

        order.items?.forEach((item: any) => {
            const prodName = item.product?.name || '';
            const { itemMargin, isFullMargin, hasPartnerCommission } = calculateNetProfit(prefix, prodName, item.priceCents, isReferralAnnunci, item.quantity);
            orderMarginCents += itemMargin;
            if (isFullMargin) orderHasFullMarginItems = true;
            if (hasPartnerCommission) orderHasCommission = true;
        });

        totalMarginCents += orderMarginCents;

        recentMarginOrders.push({
            id: order.id,
            orderNumber: order.orderNumber,
            date: new Date(order.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            productNames: order.items?.map((i: any) => i.product.name).join(', ') || 'Vari',
            marginCents: orderMarginCents,
            hasFullMarginItems: orderHasFullMarginItems,
            hasCommission: orderHasCommission
        });
    });

    // REVENUE-PER-VISITOR (The Key Metric)
    const activeUsers = totals?.users > 0 ? totals.users : 1; // Prevent division by 0
    const marginPerVisitorCents = totalMarginCents / activeUsers;
    const conversionRate = activeUsers > 0 ? ((initialOrders.length / activeUsers) * 100).toFixed(2) : '0.00';

    return (
        <div className={`-m-8 p-8 min-h-screen transition-colors duration-300 ${bgClass}`}>
            <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">

                {/* HEAD */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800/10 pb-4">
                    <div>
                        <h1 className="text-3xl font-display font-bold tracking-tight">Analytics Dashboard</h1>
                        <p className={`${textMuted} text-[15px] mt-1 flex items-center gap-2`}>
                            Traffico e Comportamento Utenti (Powered by GA4)
                        </p>
                    </div>
                    <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full border transition-all ${darkMode ? 'border-gray-700 hover:bg-gray-800 text-yellow-300' : 'border-gray-200 hover:bg-gray-100 text-gray-600'}`}>
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                </div>

                {/* KPI OPERATIONAL (Top Row) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-colors`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                                <Users size={24} />
                            </div>
                            <span className="flex items-center text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full"><Activity size={12} className="mr-1" /> {conversionRate}% CR</span>
                        </div>
                        <div className={`text-sm font-semibold uppercase tracking-wider ${textMuted}`}>Utenti Attivi (GA4)</div>
                        <div className="text-3xl font-display font-bold mt-1 text-gray-900 dark:text-gray-100">{totals.users.toLocaleString()}</div>
                    </div>

                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-colors`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                                <Euro size={24} />
                            </div>
                            <span className="flex items-center text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full" title="Basato su tutti gli ordini registrati">DB Reale</span>
                        </div>
                        <div className={`text-sm font-semibold uppercase tracking-wider ${textMuted}`}>Margine Netto Reale</div>
                        <div className="text-3xl font-display font-bold mt-1 text-gray-900 dark:text-gray-100">€{(totalMarginCents / 100).toFixed(2)}</div>
                    </div>

                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-colors`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                                <Activity size={24} />
                            </div>
                            <span className="flex items-center text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full"><ArrowUpRight size={14} className="mr-1" /> KPI</span>
                        </div>
                        <div className={`text-sm font-semibold uppercase tracking-wider ${textMuted}`}>Rev. per Visitor</div>
                        <div className="text-3xl font-display font-bold mt-1 text-gray-900 dark:text-gray-100">€{(marginPerVisitorCents / 100).toFixed(2)}</div>
                        <div className={`text-[10px] mt-1 ${textMuted}`}>Margine Medio / Utente Attivo</div>
                    </div>

                    <div className={`${cardClass} rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-colors`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                                <ShieldCheck size={24} />
                            </div>
                            <span className="flex items-center text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Ordini</span>
                        </div>
                        <div className={`text-sm font-semibold uppercase tracking-wider ${textMuted}`}>Sorgenti Maggiori</div>
                        <div className="mt-2 space-y-1">
                            {recentMarginOrders.slice(0, 3).map((o, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                    <span className="font-mono">{o.orderNumber}</span>
                                    <div className="flex gap-1" title={o.hasCommission ? 'Traffico Partner (Commissione 10%)' : 'Traffico Diretto (Margine Totale)'}>
                                        {o.hasCommission ? (
                                            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                        ) : (
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Traffic Chart (First Widget Extension) */}
                    <div className={`${cardClass} rounded-3xl p-6 border shadow-sm transition-colors flex flex-col`}>
                        <h3 className="font-bold text-lg flex items-center gap-2 mb-6"><BarChart2 className="text-blue-500" /> Traffico Giornaliero (Ultimi 7 gg)</h3>
                        <div className="h-[280px] w-full flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dailyTraffic} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#374151' : '#E5E7EB'} />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: darkMode ? '#9CA3AF' : '#6B7280' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: darkMode ? '#9CA3AF' : '#6B7280' }} />
                                    <RechartsTooltip
                                        cursor={{ stroke: darkMode ? '#4B5563' : '#9CA3AF', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        contentStyle={{ backgroundColor: darkMode ? '#1F2937' : '#FFFFFF', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: darkMode ? '#F3F4F6' : '#111827' }}
                                    />
                                    <Area type="monotone" dataKey="sessions" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorSessions)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Behavior - Top Pages (Second Widget) */}
                    <div className={`${cardClass} rounded-3xl p-6 md:p-8 border shadow-sm transition-colors flex flex-col`}>
                        <h3 className="font-bold text-lg flex items-center gap-2 mb-6"><Activity className="text-purple-500" /> Comportamento: Top 5 Pagine</h3>

                        <div className="space-y-4 flex-1">
                            <div className={`grid grid-cols-12 text-xs font-bold uppercase tracking-widest border-b pb-3 ${darkMode ? 'border-gray-800 text-gray-500' : 'border-gray-100 text-gray-400'}`}>
                                <div className="col-span-1 text-center">#</div>
                                <div className="col-span-6 md:col-span-7">Pagina</div>
                                <div className="col-span-3 md:col-span-2 text-right">Visite</div>
                                <div className="col-span-2 text-right flex items-center justify-end"><Clock size={14} className="mr-1" /> Tempo</div>
                            </div>

                            {topPages.map((page: any, idx: number) => (
                                <div key={idx} className={`grid grid-cols-12 items-center text-sm border-b pb-3 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 p-2 -mx-2 rounded-lg transition-colors ${darkMode ? 'border-gray-800' : 'border-gray-50'}`}>
                                    <div className={`col-span-1 font-bold text-center ${idx < 3 ? 'text-fm-cta' : textMuted}`}>{idx + 1}</div>
                                    <div className="col-span-6 md:col-span-7 pr-2">
                                        <div className="font-semibold truncate text-gray-900 dark:text-gray-100">{page.title}</div>
                                        <div className={`text-xs truncate ${textMuted}`}>{page.path}</div>
                                    </div>
                                    <div className="col-span-3 md:col-span-2 text-right font-bold text-gray-700 dark:text-gray-300">
                                        {page.views.toLocaleString()}
                                    </div>
                                    <div className="col-span-2 text-right font-mono text-xs font-semibold text-gray-500 dark:text-gray-400">
                                        {page.avgTime}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* SANDBOX ORDER TABLE */}
                <div className={`${cardClass} rounded-3xl p-6 md:p-8 border shadow-sm transition-colors mt-8`}>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-lg flex items-center gap-2"><Activity className="text-blue-500" /> Ordini Sandbox Recenti</h3>
                        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full">Test Sandbox ({recentMarginOrders.length})</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className={`border-b text-xs uppercase tracking-wider ${darkMode ? 'border-gray-800 text-gray-500' : 'border-gray-100 text-gray-400'}`}>
                                    <th className="pb-3 px-4 font-bold">Codice</th>
                                    <th className="pb-3 px-4 font-bold">Data</th>
                                    <th className="pb-3 px-4 font-bold">Prodotto</th>
                                    <th className="pb-3 px-4 font-bold text-right">Margine SRL</th>
                                    <th className="pb-3 px-4 font-bold text-center">Stato</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {recentMarginOrders.slice(0, 5).map((order, idx) => (
                                    <tr key={idx} className={`border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${darkMode ? 'border-gray-800' : 'border-gray-50'}`}>
                                        <td className="py-3 px-4 font-mono font-medium">{order.orderNumber}</td>
                                        <td className={`py-3 px-4 ${textMuted}`}>{order.date}</td>
                                        <td className="py-3 px-4 max-w-[200px] truncate" title={order.productNames}>{order.productNames}</td>
                                        <td className="py-3 px-4 text-right font-bold text-emerald-600">€{(order.marginCents / 100).toFixed(2)}</td>
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${order.hasCommission ? 'bg-orange-500' : 'bg-emerald-500'}`} title={order.hasCommission ? 'Traffico Partner' : 'Traffico Diretto'}></span>
                                                <span className="bg-amber-50 text-amber-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Sandbox</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {recentMarginOrders.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-gray-400 italic">Nessun ordine sandbox trovato.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
