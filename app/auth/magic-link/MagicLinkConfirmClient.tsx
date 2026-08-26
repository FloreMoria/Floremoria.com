'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * Landing anti-prefetch: lo scanner GET non completa il login;
 * solo un click utente avvia il callback API che imposta i cookie.
 */
export default function MagicLinkConfirmClient() {
    const searchParams = useSearchParams();
    const token = useMemo(() => (searchParams.get('token') || '').trim(), [searchParams]);
    const [busy, setBusy] = useState(false);

    const continueHref = token
        ? `/api/auth/magic-link/callback?token=${encodeURIComponent(token)}`
        : '/login?error=magic_link_invalid';

    const onContinue = () => {
        setBusy(true);
        window.location.assign(continueHref);
    };

    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
                <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880]">Floremoria</p>
                    <h1 className="mt-4 text-xl font-semibold text-slate-900">Link non valido</h1>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                        Il collegamento di accesso non è completo. Richiedi un nuovo Magic Link dalla pagina di accesso.
                    </p>
                    <Link
                        href="/login"
                        className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-[#0f172a] py-3.5 text-sm font-bold text-white transition hover:bg-slate-800"
                    >
                        Vai al login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
            <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a880]">Floremoria</p>
                <h1 className="mt-4 text-xl font-semibold text-slate-900">Conferma accesso</h1>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                    Stai per entrare nella tua area riservata. Premi il pulsante qui sotto per completare l&apos;accesso
                    in sicurezza.
                </p>
                <button
                    type="button"
                    onClick={onContinue}
                    disabled={busy}
                    className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-[#0f172a] py-3.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                    {busy ? 'Accesso in corso…' : 'Accedi a FloreMoria'}
                </button>
                <p className="mt-4 text-xs text-slate-400">Il collegamento resta valido per 24 ore dalla richiesta.</p>
            </div>
        </div>
    );
}
