'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Evita schermata bianca in WebView WhatsApp se la mini-app fiorista va in errore RSC/client.
 */
export default function FioristaError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[fiorista] page error:', error);
    }, [error]);

    return (
        <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880]">Floremoria</p>
            <h1 className="mt-3 text-xl font-semibold text-slate-900">Qualcosa non ha funzionato</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Non siamo riusciti a caricare la pagina di consegna. Controlla la connessione e riprova, oppure
                riapri il link ricevuto su WhatsApp.
            </p>
            <div className="mt-8 flex w-full flex-col gap-3">
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-xl bg-[#0f172a] px-5 py-3 text-sm font-bold text-white"
                >
                    Riprova
                </button>
                <Link
                    href="/"
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700"
                >
                    Torna al sito
                </Link>
            </div>
        </div>
    );
}
