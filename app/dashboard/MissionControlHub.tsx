'use client';

import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, CheckCircle2, LayoutGrid } from 'lucide-react';

const ROW1 = [
    { id: 'ga4', label: 'GA4', icon: '📈', url: 'https://analytics.google.com' },
    { id: 'calendar', label: 'Calendar', icon: '📅', url: 'https://calendar.google.com' },
    { id: 'ads', label: 'Google Ads', icon: '🎯', url: 'https://ads.google.com' },
    { id: 'merchant', label: 'Merchant', icon: '🛍️', url: 'https://merchants.google.com' },
    { id: 'maps', label: 'Maps', icon: '📍', url: 'https://business.google.com' },
];

const ROW2 = [
    { id: 'gmail', label: 'Gmail', icon: '📧', url: 'https://mail.google.com' },
    { id: 'gemini', label: 'Gemini', icon: '✨', url: 'https://gemini.google.com' },
    { id: 'meet', label: 'Meet', icon: '📹', url: 'https://meet.google.com' },
    { id: 'openreply', label: 'OpenReply', icon: '🤖', url: '#' },
];

const ROW3 = [
    { id: 'github', label: 'GitHub', icon: '💻', url: 'https://github.com' },
    { id: 'ig', label: 'Instagram', icon: '📸', url: 'https://instagram.com' },
    { id: 'fb', label: 'Facebook', icon: '👥', url: 'https://business.facebook.com' },
    { id: 'tiktok', label: 'TikTok', icon: '🎵', url: 'https://tiktok.com' },
    { id: 'yt', label: 'YouTube', icon: '▶️', url: 'https://youtube.com/studio' },
];

export default function MissionControlHub({ orders }: { orders: any[] }) {
    const [states, setStates] = useState<Record<string, string>>({});
    
    useEffect(() => {
        const fetchStates = async () => {
            try {
                const res = await fetch('/api/dashboard/mission-control');
                const data = await res.json();
                setStates(data);
            } catch (error) {
                console.error('Polling failed, using fallback states');
                setStates({ github: 'red', merchant: 'yellow' });
            }
        };

        fetchStates();
        const interval = setInterval(fetchStates, 10000);
        return () => clearInterval(interval);
    }, []);

    const getColorClass = (state: string) => {
        switch(state) {
            case 'green': return 'border-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.1)] bg-white text-slate-800 hover:bg-slate-50';
            case 'yellow': return 'border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)] bg-white text-slate-800 hover:bg-amber-50';
            case 'red': return 'border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] bg-white text-red-700 font-bold hover:bg-red-50';
            default: return 'border-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.1)] bg-white text-slate-800 hover:bg-slate-50'; // Default green
        }
    };

    const StatusButton = ({ btn }: { btn: any }) => {
        const state = states[btn.id] || 'green';
        return (
            <a 
                href={btn.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 w-full min-w-[70px] ${getColorClass(state)}`}
            >
                <span className="text-xl sm:text-2xl mb-1.5">{btn.icon}</span>
                <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-widest text-center">{btn.label}</span>
            </a>
        );
    };

    return (
        <div className="flex flex-col h-full gap-4 md:gap-6 fade-in min-h-0">
            {/* BUTTON GRIDS (5-4-5) */}
            <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-sm shrink-0">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="text-fm-cta" size={24} />
                        <h3 className="font-display font-bold text-xl text-slate-800 uppercase tracking-wide">Command Center</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Sistema Operativo
                    </div>
                </div>
                
                <div className="flex flex-col gap-4 max-w-4xl mx-auto">
                    {/* Row 1: 5 Buttons */}
                    <div className="grid grid-cols-5 gap-3">
                        {ROW1.map(btn => <StatusButton key={btn.id} btn={btn} />)}
                    </div>
                    {/* Row 2: 4 Buttons */}
                    <div className="grid grid-cols-4 gap-3 md:px-12">
                        {ROW2.map(btn => <StatusButton key={btn.id} btn={btn} />)}
                    </div>
                    {/* Row 3: 5 Buttons */}
                    <div className="grid grid-cols-5 gap-3">
                        {ROW3.map(btn => <StatusButton key={btn.id} btn={btn} />)}
                    </div>
                </div>
            </div>

            {/* REAL-TIME ORDER STREAM */}
            <div className="bg-white rounded-3xl p-4 md:p-6 border border-slate-200 shadow-sm relative overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <Activity className="text-blue-500" size={20} />
                        <h3 className="font-bold text-lg text-slate-800 uppercase">Live Orders Stream</h3>
                    </div>
                </div>

                <div className="overflow-y-auto custom-scrollbar flex-1 min-h-[150px] -mx-4 px-4 md:-mx-6 md:px-6">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white z-10">
                            <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-500">
                                <th className="pb-3 px-4 font-bold">Stato / Alert</th>
                                <th className="pb-3 px-4 font-bold">Data Ingresso</th>
                                <th className="pb-3 px-4 font-bold">ID Ordine</th>
                                <th className="pb-3 px-4 font-bold">Destinazione</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {orders.slice(0, 10).map((order) => {
                                // Real-time issue logic
                                const hasIssue = order.status === 'PENDING' || order.additionalInstructions?.toLowerCase().includes('urgent');
                                
                                return (
                                    <tr key={order.id} className={`border-b border-slate-50 last:border-0 transition-colors ${hasIssue ? 'bg-red-50/20 hover:bg-red-50/50' : 'hover:bg-slate-50/50'}`}>
                                        <td className="py-3 px-4">
                                            {hasIssue ? (
                                                <div className="flex items-center gap-1.5 text-red-600 bg-white border border-red-200 rounded-lg px-2.5 py-1 w-max text-xs font-bold uppercase">
                                                    <AlertCircle size={14} /> Critical / Pending
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-emerald-600 bg-white border border-emerald-200 rounded-lg px-2.5 py-1 w-max text-xs font-bold uppercase">
                                                    <CheckCircle2 size={14} /> Processed
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-slate-500 font-mono text-xs">
                                            {new Date(order.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td className="py-3 px-4 font-mono font-medium text-slate-800">{order.orderNumber}</td>
                                        <td className="py-3 px-4 truncate max-w-[250px] text-slate-700 font-medium">
                                            {order.cemeteryName} ({order.cemeteryCity})
                                        </td>
                                    </tr>
                                );
                            })}
                            {orders.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-gray-400 italic">Nessun ordine nel live stream.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
