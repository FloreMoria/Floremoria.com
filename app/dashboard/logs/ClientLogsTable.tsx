'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search, History, Terminal, Info, Clock, Archive } from 'lucide-react';
import { FloremoriaLog } from '@prisma/client';

export default function ClientLogsTable({ initialLogs, initialQuery }: { initialLogs: FloremoriaLog[], initialQuery: string }) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState(initialQuery);

    const handleSearch = (e: FormEvent) => {
        e.preventDefault();
        router.push(`/dashboard/logs?q=${encodeURIComponent(searchQuery)}`);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight flex items-center gap-3">
                        <Terminal className="text-fm-gold" size={28} /> Log di Sistema
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Tracciamento sessioni operative, prompt strutturali e interventi di sistema</p>
                </div>

                <form onSubmit={handleSearch} className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Ricerca per tag, argomento o test..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none transition-all shadow-sm bg-white"
                    />
                </form>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto w-full custom-scrollbar">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/70 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
                                <th className="py-4 px-6 font-semibold"><div className="flex items-center gap-2"><Clock size={14} /> Data Sessione</div></th>
                                <th className="py-4 px-6 font-semibold">Tag</th>
                                <th className="py-4 px-6 font-semibold">Argomento / Riassunto</th>
                                <th className="py-4 px-6 font-semibold"><div className="flex items-center gap-2"><Terminal size={14} /> Dettaglio Prompt</div></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {initialLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-gray-500 text-sm">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <Archive size={32} className="text-gray-300" />
                                            <span>Nessun log trovato. Prova con altri criteri di ricerca.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                initialLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="py-4 px-6 text-sm whitespace-nowrap align-top">
                                            <div className="font-semibold text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg inline-flex shadow-sm bg-white">
                                                {new Date(log.sessionDate).toLocaleDateString('it-IT')}
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 align-top">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                                                {log.tag || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 align-top">
                                            <div className="font-bold text-gray-900 mb-1">{log.topic}</div>
                                            <div className="text-sm text-gray-600 italic border-l-2 border-fm-gold/30 pl-3">
                                                "{log.shortSummary}"
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 align-top text-xs text-slate-500">
                                            {log.keyPrompt ? (
                                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono shadow-inner max-h-32 overflow-y-auto whitespace-pre-wrap">
                                                    {log.keyPrompt}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic">Non disponibile</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
