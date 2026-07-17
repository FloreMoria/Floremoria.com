'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setSuccessMsg(data.message);
            } else {
                setErrorMsg(data.message || 'Errore durante la richiesta di ripristino.');
            }
        } catch {
            setErrorMsg('Errore di rete. Controlla la tua connessione.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12">
            <div className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-center text-[#c5a880] mb-2">Password dimenticata</p>
                <h1 className="text-xl font-display font-bold text-center text-slate-900 mb-6">Recupera credenziali</h1>
                
                {successMsg ? (
                    <div className="space-y-4">
                        <div className="rounded-xl bg-emerald-50 p-4 text-xs font-medium text-emerald-800 border border-emerald-100 leading-relaxed">
                            {successMsg}
                        </div>
                        <Link
                            href="/login"
                            className="mt-6 flex w-full items-center justify-center rounded-2xl bg-black py-3.5 text-sm font-bold text-white transition hover:bg-slate-800"
                        >
                            Torna al login
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errorMsg && (
                            <div className="rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-700 border border-red-100">
                                {errorMsg}
                            </div>
                        )}

                        <p className="text-xs text-slate-500 leading-relaxed mb-4">
                            Inserisci l'indirizzo email associato al tuo account FloreMoria. Ti invieremo un link sicuro per reimpostare la tua password.
                        </p>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Indirizzo Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="La tua email..."
                                className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-black text-sm"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-black hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-colors shadow-sm mt-4 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? 'Invio in corso...' : 'Invia link di recupero'}
                        </button>

                        <div className="text-center mt-6">
                            <Link href="/login" className="text-xs text-[#c5a880] hover:text-black font-semibold transition-colors">
                                Torna al login
                            </Link>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
