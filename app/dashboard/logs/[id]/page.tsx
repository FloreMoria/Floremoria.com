import { FloremoriaLog } from '@prisma/client';
import prisma from '@/lib/prisma';
import Link from 'next/link';
import { ArrowLeft, Terminal, LayoutList, CheckCircle } from 'lucide-react';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';

export const metadata = {
    title: 'Memoria Storica | Dettaglio Verbale | Floremoria',
};

export const dynamic = 'force-dynamic';

export default async function LogDetailPage({ params }: { params: Promise<{ id: string }> }) {
    noStore(); // Explicitly opt out of all Next.js caching

    const { id } = await params;
    const logId = parseInt(id, 10);
    
    if (isNaN(logId)) {
        notFound();
    }

    const log = await prisma.floremoriaLog.findUnique({
        where: { id: logId }
    });

    if (!log) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-white relative text-slate-900 selection:bg-fm-cta/20">
            <div className="max-w-[800px] mx-auto px-6 py-20 fade-in">
                
                {/* Header Back Link */}
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-12">
                    <ArrowLeft size={16} /> Torna alla Dashboard
                </Link>

                {/* Editorial Header */}
                <header className="mb-14">
                    <div className="flex items-center gap-3 mb-4">
                        <time className="text-sm text-slate-500 font-sans">
                            {new Date(log.sessionDate).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}
                        </time>
                    </div>
                    
                    <h1 className="text-4xl md:text-5xl font-sans font-bold text-slate-900 leading-tight mb-6">
                        {log.topic}
                    </h1>

                    {log.tag && (
                        <div className="flex flex-wrap gap-2">
                            {log.tag.split(',').map((t: string) => t.trim()).map((tag: string, i: number) => (
                                <Link 
                                    key={i} 
                                    href={`/dashboard/logs?filter=${encodeURIComponent(tag)}`}
                                    className="px-3 py-1 bg-white border border-slate-200 text-[11px] uppercase font-bold tracking-widest text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors rounded-sm"
                                >
                                    {tag}
                                </Link>
                            ))}
                        </div>
                    )}
                </header>

                {/* The Core Content: Editorial Body */}
                <article className="max-w-none text-slate-800">
                    
                    {log.fullText ? (
                        <div className="prose prose-slate max-w-none font-serif text-lg leading-relaxed text-slate-800 whitespace-pre-wrap">
                            {log.fullText}
                        </div>
                    ) : (
                        <div className="py-12 border-y border-slate-100 text-center my-16">
                            <p className="text-slate-400 font-serif italic text-lg">[Nessun verbale testuale esteso per questa sessione]</p>
                        </div>
                    )}
                    
                    {!log.fullText && log.shortSummary && (
                        <section className="mt-12 font-sans">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2 border-b border-slate-100 pb-3">
                                <LayoutList size={16} /> Riassunto Sintetico
                            </h2>
                            <p className="text-slate-700 leading-relaxed text-lg border-l-4 border-slate-200 pl-6 py-2 font-serif italic">
                                {log.shortSummary}
                            </p>
                        </section>
                    )}

                </article>

                {/* Meta data tecnici */}
                <footer className="mt-24 pt-12 border-t border-slate-200 space-y-10 font-sans">
                    {log.achievedResults && (
                        <section>
                            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                <CheckCircle size={18} className="text-emerald-500" /> Conclusioni Tecniche
                            </h3>
                            <p className="text-slate-600 leading-relaxed text-[15px]">
                                {log.achievedResults}
                            </p>
                        </section>
                    )}

                    {log.keyPrompt && (
                        <section>
                            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                <Terminal size={18} className="text-slate-500" /> Prompt Radice o Codice Sorgente
                            </h3>
                            <div className="bg-white text-slate-600 p-6 border border-slate-200 text-[13px] font-mono whitespace-pre-wrap leading-relaxed">
                                {log.keyPrompt}
                            </div>
                        </section>
                    )}
                </footer>
                
            </div>
        </div>
    );
}
