'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SetupPasswordFormProps {
    token: string;
}

export default function SetupPasswordForm({ token }: SetupPasswordFormProps) {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Se non è fornito alcun token nell'URL, blocca il form e mostra un errore immediato
    if (!token) {
        return (
            <div className="bg-white/80 backdrop-blur-xl py-10 px-8 lg:px-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] border border-red-100 text-center">
                <div className="text-red-500 text-4xl mb-4">⚠️</div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Attivazione non valida</h2>
                <p className="text-sm text-slate-500 mb-6">
                    Il token di attivazione è mancante o vuoto. Si prega di verificare il collegamento ricevuto via email.
                </p>
                <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-all"
                >
                    Torna alla Home
                </Link>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        
        // 1. Validazione client-side
        if (password.length < 8) {
            setErrorMsg('La password deve contenere almeno 8 caratteri.');
            return;
        }

        if (password !== confirmPassword) {
            setErrorMsg('Le password inserite non coincidono.');
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/setup-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setSuccessMsg(data.message || 'La password è stata salvata correttamente.');
            } else {
                setErrorMsg(data.message || 'Impossibile configurare la password. Il token potrebbe essere scaduto.');
                setIsLoading(false);
            }
        } catch (err) {
            setErrorMsg('Errore di connessione con il server. Riprova più tardi.');
            setIsLoading(false);
        }
    };

    // Schermata di successo
    if (successMsg) {
        return (
            <div className="bg-white/80 backdrop-blur-xl py-10 px-8 lg:px-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] border border-white/60 text-center animate-in fade-in">
                <div className="text-emerald-500 text-5xl mb-4">✓</div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Account Attivato</h2>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                    La Sua password è stata configurata con successo. Il Suo profilo è ora abilitato e può procedere all'accesso.
                </p>
                <Link
                    href="/login"
                    className="w-full block text-center py-4 px-4 border border-transparent rounded-xl shadow-md text-[17px] font-semibold text-white bg-[#c5a880] hover:bg-[#b59870] transition-all"
                >
                    Vai alla pagina di Login
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-white/80 backdrop-blur-xl py-10 px-8 lg:px-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] border border-white/60">
            <h2 className="text-lg font-bold text-slate-800 text-center mb-6">Configura la tua password</h2>
            
            <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="password">
                        Nuova Password
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="appearance-none block w-full px-4 py-3 bg-white border border-[#c5a880]/30 rounded-xl font-body text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#c5a880]/50 focus:border-[#c5a880] transition-all"
                        placeholder="Minimo 8 caratteri"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="confirmPassword">
                        Conferma Password
                    </label>
                    <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="appearance-none block w-full px-4 py-3 bg-white border border-[#c5a880]/30 rounded-xl font-body text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#c5a880]/50 focus:border-[#c5a880] transition-all"
                        placeholder="Reinserisci la password"
                    />
                </div>

                {errorMsg && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-100 font-semibold text-center py-2.5 px-3 rounded-lg leading-tight">
                        {errorMsg}
                    </div>
                )}

                <div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-[17px] font-semibold text-white bg-[#c5a880] hover:bg-[#b59870] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#c5a880] transition-all duration-300 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? 'Salvataggio...' : 'Attiva Account'}
                    </button>
                </div>
            </form>
        </div>
    );
}
