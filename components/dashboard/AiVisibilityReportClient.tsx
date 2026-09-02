'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Bot,
    Check,
    Copy,
    ExternalLink,
    Printer,
    Sparkles,
} from 'lucide-react';
import type {
    AiBenchmarkPrompt,
    AiComplianceStatus,
    AiScorecardCriterion,
    AiVerificationCriterion,
} from '@/lib/seo/aiVisibilityBenchmark';

type ReportPayload = {
    compliance: AiComplianceStatus;
    prompts: AiBenchmarkPrompt[];
    scorecard: AiScorecardCriterion[];
    verificationCriteria: AiVerificationCriterion[];
    checklist: string[];
    links: { llmsTxt: string; llmsFull: string; assistenza: string };
    maxScorePerPrompt: number;
};

function Badge({
    label,
    status,
}: {
    label: string;
    status: 'ok' | 'warn' | 'error';
}) {
    const styles =
        status === 'ok'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : status === 'warn'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-rose-50 text-rose-800 border-rose-200';
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${styles}`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full ${status === 'ok' ? 'bg-emerald-500' : status === 'warn' ? 'bg-amber-500' : 'bg-rose-500'}`}
            />
            {label}
        </span>
    );
}

function intentBadgeClass(intentId: string): string {
    switch (intentId) {
        case 'exploratory':
            return 'bg-indigo-50 text-indigo-800 border-indigo-100';
        case 'local-cemetery':
            return 'bg-sky-50 text-sky-800 border-sky-100';
        case 'comparative':
            return 'bg-violet-50 text-violet-800 border-violet-100';
        case 'funeral-urgency':
            return 'bg-amber-50 text-amber-800 border-amber-100';
        default:
            return 'bg-slate-50 text-slate-700 border-slate-100';
    }
}

export default function AiVisibilityReportClient({ report }: { report: ReportPayload }) {
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const copyPrompt = useCallback(async (prompt: AiBenchmarkPrompt) => {
        try {
            await navigator.clipboard.writeText(prompt.query);
            setCopiedId(prompt.id);
            window.setTimeout(() => setCopiedId(null), 2000);
        } catch {
            /* ignore */
        }
    }, []);

    const { compliance } = report;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 print:px-0 print:py-4">
            <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                    <ArrowLeft size={14} />
                    Torna alla Overview
                </Link>
                <div className="flex flex-wrap gap-2">
                    <a
                        href={report.links.llmsTxt}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                        <ExternalLink size={13} />
                        Apri llms.txt
                    </a>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                    >
                        <Printer size={13} />
                        Stampa / PDF
                    </button>
                </div>
            </div>

            <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700 shrink-0">
                        <Bot size={22} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-xl font-display font-bold text-slate-900 leading-snug">
                            Rapporto Visibilità nei Motori Generativi AI (AEO / GEO)
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">
                            Generato il{' '}
                            {new Date(compliance.generatedAt).toLocaleString('it-IT', {
                                dateStyle: 'long',
                                timeStyle: 'short',
                            })}
                            {' · '}
                            Protocollo aggiornato: {compliance.protocolUpdatedAt}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Badge
                        label={`llms.txt: ${compliance.llmsTxt === 'active' ? 'ATTIVO' : 'MANCANTE'}`}
                        status={compliance.llmsTxt === 'active' ? 'ok' : 'error'}
                    />
                    <Badge
                        label={`JSON-LD Schema: ${compliance.jsonLd === 'active' ? 'ATTIVO' : 'MANCANTE'}`}
                        status={compliance.jsonLd === 'active' ? 'ok' : 'error'}
                    />
                    <Badge
                        label={`Cyber Security: ${compliance.cyberSecurity === 'verified' ? 'VERIFICATO' : 'ATTENZIONE'}`}
                        status={compliance.cyberSecurity === 'verified' ? 'ok' : 'warn'}
                    />
                </div>
            </header>

            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5 text-xs text-slate-700 leading-relaxed space-y-2">
                <div className="flex items-center gap-2 text-indigo-900 font-bold uppercase tracking-wider text-[10px]">
                    <Sparkles size={14} />
                    Perché questo audit interno
                </div>
                <p>
                    A differenza di audit commerciali opachi (es. servizi tipo GPTFusion), questo
                    protocollo è <strong>ripetibile, gratuito e allineato ai nostri asset reali</strong>{' '}
                    (<code className="text-[10px]">llms.txt</code>, JSON-LD, FAQ strutturate). Esegui
                    i 12 prompt su ChatGPT, Perplexity, Claude e Gemini ogni 4–8 settimane e registra i
                    punteggi nella scorecard per monitorare i progressi nel tempo.
                </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    Scorecard oggettiva (0–5 per criterio · max {report.maxScorePerPrompt}/prompt)
                </h2>
                <div className="grid gap-3 md:grid-cols-3">
                    {report.scorecard.map((c) => (
                        <div
                            key={c.id}
                            className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2"
                        >
                            <p className="text-xs font-bold text-slate-800">{c.name}</p>
                            <p className="text-[10px] text-slate-500">{c.description}</p>
                            <ul className="text-[10px] text-slate-600 space-y-0.5">
                                {c.scale.map((s) => (
                                    <li key={s.score}>
                                        <span className="font-mono font-bold">{s.score}</span> —{' '}
                                        {s.meaning}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    Matrice Benchmark — 12 Prompt Utente
                </h2>
                <p className="text-xs text-slate-500">
                    Criteri di verifica per ogni risposta AI:{' '}
                    {report.verificationCriteria.map((v) => v.name).join(' · ')}.
                </p>
                <div className="space-y-3">
                    {report.prompts.map((prompt) => (
                        <div
                            key={prompt.id}
                            className="rounded-xl border border-slate-100 p-4 hover:border-slate-200 transition-colors"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[10px] font-mono font-bold text-slate-400">
                                            #{String(prompt.id).padStart(2, '0')}
                                        </span>
                                        <span
                                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${intentBadgeClass(prompt.intentId)}`}
                                        >
                                            {prompt.intentLabel}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-900 leading-snug">
                                        {prompt.query}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {report.verificationCriteria.map((v) => (
                                            <span
                                                key={v.id}
                                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                                                title={v.description}
                                            >
                                                {v.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void copyPrompt(prompt)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 hover:bg-slate-50 shrink-0 print:hidden"
                                >
                                    {copiedId === prompt.id ? (
                                        <>
                                            <Check size={12} className="text-emerald-600" />
                                            Copiato
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={12} />
                                            Copia prompt
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] print:grid">
                                <div className="rounded-lg border border-dashed border-slate-200 py-2">
                                    <p className="text-slate-400 uppercase font-bold">Brand</p>
                                    <p className="font-mono text-slate-300 mt-1">_/5</p>
                                </div>
                                <div className="rounded-lg border border-dashed border-slate-200 py-2">
                                    <p className="text-slate-400 uppercase font-bold">Accuratezza</p>
                                    <p className="font-mono text-slate-300 mt-1">_/5</p>
                                </div>
                                <div className="rounded-lg border border-dashed border-slate-200 py-2">
                                    <p className="text-slate-400 uppercase font-bold">Foto/Garanzia</p>
                                    <p className="font-mono text-slate-300 mt-1">_/5</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Checklist post-test
                </h2>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
                    {report.checklist.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
