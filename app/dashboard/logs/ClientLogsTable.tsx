'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search, History, Terminal, Info, Clock, Archive, Copy, Check } from 'lucide-react';
import { FloremoriaLog } from '@prisma/client';

export default function ClientLogsTable({ initialLogs, initialQuery }: { initialLogs: FloremoriaLog[], initialQuery: string }) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [selectedLog, setSelectedLog] = useState<FloremoriaLog | null>(null);
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        if (selectedLog?.keyPrompt) {
            navigator.clipboard.writeText(selectedLog.keyPrompt);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

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
                                    <tr 
                                        key={log.id} 
                                        onClick={() => setSelectedLog(log)}
                                        className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                    >
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

            {/* Modal for Full Log Details */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 fade-in" onClick={() => setSelectedLog(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">
                                    Dettaglio Sessione • {new Date(selectedLog.sessionDate).toLocaleDateString('it-IT')}
                                </div>
                                <h3 className="text-xl font-display font-bold text-slate-900">{selectedLog.topic}</h3>
                                {selectedLog.tag && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {selectedLog.tag.split(',').map((t: string) => t.trim()).map((tag: string, i: number) => (
                                            <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setSelectedLog(null)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                            {(selectedLog.shortSummary || selectedLog.discussedPoints) && (
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">📝 Punti Discussi</h4>
                                    <p className="text-slate-600 leading-relaxed text-sm bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap">
                                        {selectedLog.discussedPoints || selectedLog.shortSummary}
                                    </p>
                                </div>
                            )}

                            {selectedLog.achievedResults && (
                                <div>
                                    <h4 className="text-sm font-bold text-emerald-700 mb-2 flex items-center gap-2">✅ Risultati Raggiunti</h4>
                                    <p className="text-slate-600 leading-relaxed text-sm bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 whitespace-pre-wrap">
                                        {selectedLog.achievedResults}
                                    </p>
                                </div>
                            )}

                            {selectedLog.pendingTasks && (
                                <div>
                                    <h4 className="text-sm font-bold text-amber-700 mb-2 flex items-center gap-2">⏳ In Completamento (Task aperti)</h4>
                                    <p className="text-slate-600 leading-relaxed text-sm bg-amber-50/50 p-4 rounded-xl border border-amber-100 whitespace-pre-wrap">
                                        {selectedLog.pendingTasks}
                                    </p>
                                </div>
                            )}

                            {selectedLog.criticalAlarms && (
                                <div>
                                    <h4 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">🚨 ALLARMI CRITICI</h4>
                                    <p className="text-red-800 leading-relaxed text-sm bg-red-100 p-4 rounded-xl border border-red-200 font-medium whitespace-pre-wrap">
                                        {selectedLog.criticalAlarms}
                                    </p>
                                </div>
                            )}

                            {selectedLog.keyPrompt && (
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><Terminal size={16} /> Prompt e Dettagli Tecnici</h4>
                                    <div className="relative group">
                                        <button 
                                            onClick={handleCopy}
                                            className="absolute top-3 right-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-2 focus:outline-none"
                                        >
                                            {isCopied ? (
                                                <><Check size={14} className="text-emerald-400" /><span className="text-xs font-bold text-emerald-400">Copiato!</span></>
                                            ) : (
                                                <><Copy size={14} /><span className="text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">Copia testo</span></>
                                            )}
                                        </button>
                                        <pre className="bg-[#0D1117] border border-slate-800 text-slate-300 p-5 pt-14 rounded-xl text-[13px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                                            {selectedLog.keyPrompt}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button onClick={() => setSelectedLog(null)} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                                Chiudi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
