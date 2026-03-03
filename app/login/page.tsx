'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                router.push(data.redirectUrl || '/dashboard/orders');
                router.refresh();
            } else {
                setErrorMsg(data.message || 'Credenziali errate.');
                setIsLoading(false);
            }
        } catch (err) {
            setErrorMsg('Errore di connessione al server.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAF9F6] flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Effetti di luce di sfondo - Stile FloreMoria */}
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-gradient-to-bl from-fm-gold/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-gradient-to-tr from-emerald-600/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="flex justify-center mb-6">
                    <Image
                        src="/images/logo.png" // Assumiamo che il percorso del logo sia questo, aggiorna se diverso
                        alt="FloreMoria Logo"
                        width={200}
                        height={60}
                        priority
                        className="object-contain drop-shadow-sm"
                        onError={(e: any) => {
                            e.target.style.display = 'none';
                        }}
                    />
                    {/* Fallback temporaneo in caso di percorsi diversi per il logo */}
                    <div className="text-3xl font-display font-medium text-fm-gold tracking-widest uppercase">
                        FloreMoria
                    </div>
                </div>

                <div className="bg-white/80 backdrop-blur-xl py-10 px-8 lg:px-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] border border-white/60">
                    <form className="space-y-6" onSubmit={handleLogin}>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2" htmlFor="username">
                                Identificativo
                            </label>
                            <div className="mt-1">
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="appearance-none block w-full px-4 py-3 bg-white border border-fm-gold/30 rounded-xl font-body text-fm-text shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all"
                                    placeholder="Inserisci l'identificativo"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2" htmlFor="password">
                                Codice di Accesso
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="appearance-none block w-full px-4 py-3 bg-white border border-fm-gold/30 rounded-xl font-body text-fm-text shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all"
                                    placeholder="• • • •"
                                />
                            </div>
                        </div>

                        {errorMsg && (
                            <div className="text-sm text-fm-rose font-medium text-center bg-fm-rose-soft/20 py-2 rounded-lg">
                                {errorMsg}
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-[17px] font-semibold text-white bg-fm-gold hover:bg-yellow-600 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fm-gold transition-all duration-300 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                {isLoading ? 'Accesso in corso...' : 'Accedi alla Stanza dei Bottoni'}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="mt-8 text-center">
                    <p className="text-sm text-fm-muted font-body">
                        Accesso riservato al personale autorizzato.
                    </p>
                </div>
            </div>
        </div>
    );
}
