'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Stage = 'identify' | 'password' | 'otp' | 'magic-sent';

export default function LoginPage() {
    const router = useRouter();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpTempToken, setOtpTempToken] = useState('');

    const [stage, setStage] = useState<Stage>('identify');
    const [isRegisterMode, setIsRegisterMode] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const resetMessages = () => {
        setErrorMsg('');
        setSuccessMsg('');
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const error = params.get('error');
        const expired = params.get('expired');
        const prefillEmail = params.get('email')?.trim().toLowerCase();
        const prefillPhone = params.get('phone')?.trim();

        if (prefillEmail) {
            setIdentifier(prefillEmail);
        } else if (prefillPhone) {
            setIdentifier(prefillPhone);
        }

        if (error === 'proof_foto_expired') {
            setErrorMsg(
                'Il link alla testimonianza fotografica è scaduto (valido 24 ore). Accedi con la stessa email o telefono dell\'ordine per ritrovare il Giardino della Memoria — non serve registrarsi di nuovo.'
            );
            return;
        }
        if (error === 'proof_foto_invalid') {
            setErrorMsg('Questo link non è valido o non è più utilizzabile. Accedi con email o telefono se hai già ricevuto una consegna.');
            return;
        }
        if (expired === '1') {
            setErrorMsg('La sessione è scaduta. Accedi di nuovo con email o telefono per continuare.');
        }
    }, []);

    const backToStart = () => {
        setStage('identify');
        setPassword('');
        setOtpCode('');
        setOtpTempToken('');
        resetMessages();
    };

    const toggleRegisterMode = () => {
        setIsRegisterMode((prev) => !prev);
        backToStart();
    };

    // Attivazione profilo: crea USER e invia Magic Link / OTP.
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        resetMessages();
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setErrorMsg(data.message || 'Non è stato possibile attivare il profilo.');
                return;
            }

            if (data.channel === 'email') {
                setSuccessMsg(data.message || 'Controlla la tua email per completare l\'attivazione.');
                setStage('magic-sent');
                return;
            }

            setOtpTempToken(data.tempToken);
            setSuccessMsg(data.message || 'Codice inviato.');
            setStage('otp');
        } catch {
            setErrorMsg('Errore di connessione al server.');
        } finally {
            setIsLoading(false);
        }
    };

    // Passo 1: il backend decide la via in base al ruolo a database.
    const handleIdentify = async (e: React.FormEvent) => {
        e.preventDefault();
        resetMessages();
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/identity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setErrorMsg(data.message || 'Non è stato possibile verificare questo contatto.');
                return;
            }

            if (data.mode === 'password') {
                setStage('password');
                return;
            }

            // Passwordless: email → Magic Link, telefono → OTP.
            if (data.channel === 'email') {
                const mlRes = await fetch('/api/auth/magic-link/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: identifier }),
                });
                const mlData = await mlRes.json();
                if (mlRes.ok && mlData.success) {
                    setSuccessMsg(mlData.message || 'Ti abbiamo inviato un collegamento di accesso via email.');
                    setStage('magic-sent');
                } else {
                    setErrorMsg(mlData.message || 'Impossibile inviare il collegamento di accesso.');
                }
                return;
            }

            // Canale telefono → invio codice OTP.
            const otpRes = await fetch('/api/auth/otp/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier }),
            });
            const otpData = await otpRes.json();
            if (otpRes.ok && otpData.success) {
                setOtpTempToken(otpData.tempToken);
                setSuccessMsg(otpData.message || 'Codice inviato.');
                setStage('otp');
            } else {
                setErrorMsg(otpData.message || 'Impossibile inviare il codice.');
            }
        } catch {
            setErrorMsg('Errore di connessione al server.');
        } finally {
            setIsLoading(false);
        }
    };

    // Passo 2a: login con password (ruoli professionali).
    const handlePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        resetMessages();
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: identifier, password }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                router.push(data.redirectUrl || '/dashboard');
                router.refresh();
            } else {
                const hint = typeof data.hint === 'string' ? data.hint : '';
                setErrorMsg(hint ? `${data.message || 'Credenziali errate.'} ${hint}` : data.message || 'Credenziali errate.');
                setIsLoading(false);
            }
        } catch {
            setErrorMsg('Errore di connessione al server.');
            setIsLoading(false);
        }
    };

    // Passo 2b: verifica del codice OTP (clienti privati via telefono).
    const handleOtpVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        resetMessages();
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: otpCode, tempToken: otpTempToken }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                router.push(data.redirectUrl || '/dashboard/user');
                router.refresh();
            } else {
                setErrorMsg(data.message || 'Codice di verifica non valido o scaduto.');
                setIsLoading(false);
            }
        } catch {
            setErrorMsg('Errore di connessione al server.');
            setIsLoading(false);
        }
    };

    const inputClass =
        'appearance-none block w-full px-4 py-3 bg-white border border-fm-gold/30 rounded-xl font-body text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all';
    const buttonClass = (loading: boolean) =>
        `w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-[17px] font-semibold text-white bg-fm-gold hover:bg-[#b59870] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fm-gold transition-all duration-300 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`;

    const heading =
        stage === 'password'
            ? 'Accesso Collaboratori'
            : stage === 'otp'
            ? isRegisterMode
                ? 'Conferma l\'attivazione'
                : 'Conferma la tua identità'
            : stage === 'magic-sent'
            ? isRegisterMode
                ? 'Attivazione inviata'
                : 'Controlla la tua email'
            : isRegisterMode
            ? 'Attiva il tuo profilo'
            : 'Accedi alla tua bacheca';
    const subheading =
        stage === 'password'
            ? 'Inserisci la password del tuo account professionale'
            : stage === 'otp'
            ? 'Abbiamo inviato un codice al tuo telefono'
            : stage === 'magic-sent'
            ? 'Ti abbiamo inviato un collegamento sicuro'
            : isRegisterMode
            ? 'Inserisci email o telefono per creare il tuo spazio personale'
            : 'Inserisci la tua email o il tuo numero di telefono';

    return (
        <div className="min-h-screen bg-[#FAF9F6] flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-gradient-to-bl from-fm-gold/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-gradient-to-tr from-emerald-600/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="flex justify-center mb-6">
                    <div className="text-3xl font-display font-medium text-fm-gold tracking-widest uppercase">
                        FloreMoria
                    </div>
                </div>

                <div className="bg-white/80 backdrop-blur-xl py-10 px-8 lg:px-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] border border-white/60">
                    <div className="text-center mb-6">
                        <h2 className="text-lg font-bold text-slate-800">{heading}</h2>
                        <p className="text-xs text-slate-400 mt-1">{subheading}</p>
                    </div>

                    {/* STADIO 1 — Identificativo unico */}
                    {stage === 'identify' && (
                        <form className="space-y-6" onSubmit={isRegisterMode ? handleRegister : handleIdentify}>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="identifier">
                                    Email o numero di telefono
                                </label>
                                <input
                                    id="identifier"
                                    type="text"
                                    autoComplete="username"
                                    required
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    className={inputClass}
                                    placeholder="es. mario.rossi@email.it o 333 1234567"
                                />
                            </div>

                            {errorMsg && (
                                <div className="text-xs text-red-600 bg-red-50 border border-red-100 font-semibold text-center py-2.5 px-3 rounded-lg leading-tight">
                                    {errorMsg}
                                </div>
                            )}

                            <button type="submit" disabled={isLoading} className={buttonClass(isLoading)}>
                                {isLoading
                                    ? 'Elaborazione...'
                                    : isRegisterMode
                                    ? 'Attiva profilo'
                                    : 'Continua'}
                            </button>

                            <div className="text-center pt-1">
                                <button
                                    type="button"
                                    onClick={toggleRegisterMode}
                                    className="text-xs font-medium text-slate-500 hover:text-fm-gold transition-colors tracking-wide"
                                >
                                    {isRegisterMode
                                        ? 'Hai già un account? Accedi'
                                        : 'Non hai ancora un account? Attiva il tuo profilo'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* STADIO 2a — Password (ruoli professionali) */}
                    {stage === 'password' && (
                        <form className="space-y-6" onSubmit={handlePassword}>
                            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-xs text-slate-600 text-center">
                                {identifier}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="password">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    autoFocus
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={inputClass}
                                    placeholder="• • • • • • • •"
                                />
                            </div>

                            {errorMsg && (
                                <div className="text-xs text-red-600 bg-red-50 border border-red-100 font-semibold text-center py-2.5 px-3 rounded-lg leading-tight">
                                    {errorMsg}
                                </div>
                            )}

                            <button type="submit" disabled={isLoading} className={buttonClass(isLoading)}>
                                {isLoading ? 'Accesso in corso...' : 'Accedi'}
                            </button>

                            <div className="text-center">
                                <button type="button" onClick={backToStart} className="text-xs text-slate-400 hover:text-slate-600 underline font-semibold transition-colors">
                                    Usa un altro contatto
                                </button>
                            </div>
                        </form>
                    )}

                    {/* STADIO 2b — Codice OTP (clienti via telefono) */}
                    {stage === 'otp' && (
                        <form className="space-y-6" onSubmit={handleOtpVerify}>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="otp-code">
                                    Codice di verifica di 6 cifre
                                </label>
                                <input
                                    id="otp-code"
                                    type="text"
                                    maxLength={6}
                                    pattern="[0-9]*"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    required
                                    autoFocus
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                    className={`${inputClass} text-center text-lg font-bold tracking-[0.5em]`}
                                    placeholder="000000"
                                />
                            </div>

                            {successMsg && (
                                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 font-semibold text-center py-2.5 px-3 rounded-lg leading-tight">
                                    {successMsg}
                                </div>
                            )}
                            {errorMsg && (
                                <div className="text-xs text-red-600 bg-red-50 border border-red-100 font-semibold text-center py-2.5 px-3 rounded-lg leading-tight">
                                    {errorMsg}
                                </div>
                            )}

                            <button type="submit" disabled={isLoading} className={buttonClass(isLoading)}>
                                {isLoading ? 'Verifica...' : 'Verifica e accedi'}
                            </button>

                            <div className="text-center">
                                <button type="button" onClick={backToStart} className="text-xs text-slate-400 hover:text-slate-600 underline font-semibold transition-colors">
                                    Usa un altro contatto
                                </button>
                            </div>
                        </form>
                    )}

                    {/* STADIO 2c — Magic Link inviato */}
                    {stage === 'magic-sent' && (
                        <div className="space-y-6 text-center">
                            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 font-semibold py-4 px-4 rounded-2xl leading-snug">
                                {successMsg || 'Ti abbiamo inviato un collegamento di accesso via email.'}
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                {isRegisterMode
                                    ? 'Apri il messaggio e tocca il collegamento per completare l\'attivazione. È valido per 15 minuti.'
                                    : 'Apri il messaggio e tocca il collegamento per entrare. È valido per 15 minuti.'}
                            </p>
                            <button type="button" onClick={() => { setIsRegisterMode(false); backToStart(); }} className="text-xs text-slate-500 hover:text-fm-gold underline font-semibold transition-colors">
                                Torna all&apos;accesso
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-400 font-body">
                        Accesso protetto e riservato alla piattaforma FloreMoria.
                    </p>
                </div>
            </div>
        </div>
    );
}
