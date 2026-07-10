'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Trash2, X } from 'lucide-react';

type Props = {
    initialTestModeActive: boolean;
};

export default function TestModeOverviewBar({ initialTestModeActive }: Props) {
    const router = useRouter();
    const [testModeActive, setTestModeActive] = useState(initialTestModeActive);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [cleanupError, setCleanupError] = useState<string | null>(null);
    const [cleanupSummary, setCleanupSummary] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [isCleaning, setIsCleaning] = useState(false);

    const toggleTestMode = () => {
        const next = !testModeActive;
        startTransition(async () => {
            try {
                const res = await fetch('/api/dashboard/test/mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: next }),
                });
                const data = await res.json();
                if (!res.ok || !data.ok) {
                    throw new Error(data.error || 'Impossibile aggiornare la modalità test.');
                }
                setTestModeActive(next);
                router.refresh();
            } catch (err) {
                console.error('[TestMode] toggle failed:', err);
            }
        });
    };

    const runCleanup = async () => {
        setIsCleaning(true);
        setCleanupError(null);
        setCleanupSummary(null);
        try {
            const res = await fetch('/api/dashboard/test/cleanup', { method: 'POST' });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Pulizia non riuscita.');
            }
            const d = data.deleted || {};
            setCleanupSummary(
                `Eliminati: ${d.orders ?? 0} ordini, ${d.chatSessions ?? 0} chat, ${d.users ?? 0} utenti.`
            );
            setConfirmOpen(false);
            router.refresh();
        } catch (err) {
            setCleanupError(err instanceof Error ? err.message : 'Errore durante la pulizia.');
        } finally {
            setIsCleaning(false);
        }
    };

    return (
        <>
            <div
                className={`rounded-2xl border px-4 py-3 md:px-5 md:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                    testModeActive
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-slate-50 border-slate-200'
                }`}
            >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <FlaskConical
                        className={`shrink-0 mt-0.5 sm:mt-0 ${testModeActive ? 'text-amber-700' : 'text-slate-500'}`}
                        size={22}
                    />
                    <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900">Modalità Test</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                            {testModeActive
                                ? 'Vedi solo dati di test. VERA e WhatsApp funzionano normalmente; i nuovi ordini/utenti manuali restano separati dalla produzione.'
                                : 'Dashboard produzione: i record di test sono nascosti.'}
                        </p>
                        {testModeActive ? (
                            <p className="text-sm font-semibold text-amber-800 mt-1">
                                ⚠️ Modalità Test Attiva
                            </p>
                        ) : null}
                        {cleanupSummary ? (
                            <p className="text-xs text-emerald-700 mt-1">{cleanupSummary}</p>
                        ) : null}
                        {cleanupError ? (
                            <p className="text-xs text-red-600 mt-1">{cleanupError}</p>
                        ) : null}
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={testModeActive}
                        disabled={isPending}
                        onClick={toggleTestMode}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                            testModeActive ? 'bg-amber-500 focus-visible:ring-amber-400' : 'bg-slate-300 focus-visible:ring-slate-400'
                        } ${isPending ? 'opacity-60 cursor-wait' : ''}`}
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                testModeActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>

                    {testModeActive ? (
                        <button
                            type="button"
                            onClick={() => setConfirmOpen(true)}
                            disabled={isCleaning}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 transition-colors disabled:opacity-60"
                        >
                            <Trash2 size={16} />
                            Svuota Dati di Test
                        </button>
                    ) : null}
                </div>
            </div>

            {confirmOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                    <div
                        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="test-cleanup-title"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <h2 id="test-cleanup-title" className="text-lg font-semibold text-slate-900">
                                Svuotare tutti i dati di test?
                            </h2>
                            <button
                                type="button"
                                onClick={() => setConfirmOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                                aria-label="Chiudi"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600">
                            Verranno eliminati definitivamente dal database tutti gli ordini, utenti e
                            sessioni chat con <code className="text-xs">isTest: true</code>. Questa azione
                            non è reversibile.
                        </p>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl"
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                onClick={runCleanup}
                                disabled={isCleaning}
                                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-60"
                            >
                                {isCleaning ? 'Eliminazione…' : 'Elimina definitivamente'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
