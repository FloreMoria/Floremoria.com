'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isB2C, setIsB2C] = useState(false);

    // States per l'accesso B2C (Magic Link / OTP)
    const [b2cMethod, setB2cMethod] = useState<'magic_link' | 'otp'>('magic_link');
    const [otpIdentifier, setOtpIdentifier] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpTempToken, setOtpTempToken] = useState('');
    const [otpStep, setOtpStep] = useState<1 | 2>(1);

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
                const hint = typeof data.hint === 'string' ? data.hint : '';
                setErrorMsg(hint ? `${data.message || 'Credenziali errate.'} ${hint}` : data.message || 'Credenziali errate.');
                setIsLoading(false);
            }
        } catch (err) {
            setErrorMsg('Errore di connessione al server.');
            setIsLoading(false);
        }
    };

    const handleMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/magic-link/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: username }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setSuccessMsg(data.message || 'Link di accesso inviato. Controlla la tua email.');
                setUsername('');
            } else {
                setErrorMsg(data.message || 'Impossibile inviare il link di accesso.');
            }
        } catch (err) {
            setErrorMsg('Errore di connessione al server.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOtpRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/otp/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ identifier: otpIdentifier }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setOtpTempToken(data.tempToken);
                setOtpStep(2);
                setSuccessMsg(data.message || 'Codice inviato con successo.');
            } else {
                setErrorMsg(data.message || 'Impossibile inviare il codice.');
            }
        } catch (err) {
            setErrorMsg('Errore di connessione al server.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOtpVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/otp/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: otpCode, tempToken: otpTempToken }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                router.push(data.redirectUrl || '/dashboard/user');
                router.refresh();
            } else {
                setErrorMsg(data.message || 'Codice di verifica non valido o scaduto.');
            }
        } catch (err) {
            setErrorMsg('Errore di connessione al server.');
        } finally {
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
                    <div className="text-3xl font-display font-medium text-fm-gold tracking-widest uppercase">
                        FloreMoria
                    </div>
                </div>

                <div className="bg-white/80 backdrop-blur-xl py-10 px-8 lg:px-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] border border-white/60">
                    
                    {/* Intestazione del form dinamica */}
                    <div className="text-center mb-6">
                        <h2 className="text-lg font-bold text-slate-800">
                            {isB2C ? 'Accesso Clienti (Senza Password)' : 'Accesso Collaboratori'}
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">
                            {isB2C ? 'Inserisci la tua email per ricevere il link magico' : 'Accedi all\'area operativa con il codice personale'}
                        </p>
                    </div>

                    {isB2C ? (
                        /* FORM CLIENTE (PASSWORDLESS) */
                        <div className="space-y-6">
                            {/* Selettore Metodo B2C */}
                            <div className="flex border-b border-slate-100 mb-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setB2cMethod('magic_link');
                                        setErrorMsg('');
                                        setSuccessMsg('');
                                    }}
                                    className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-all ${
                                        b2cMethod === 'magic_link'
                                            ? 'border-fm-gold text-fm-gold font-extrabold'
                                            : 'border-transparent text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    Email Magic Link
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setB2cMethod('otp');
                                        setErrorMsg('');
                                        setSuccessMsg('');
                                        setOtpStep(1);
                                        setOtpCode('');
                                    }}
                                    className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-all ${
                                        b2cMethod === 'otp'
                                            ? 'border-fm-gold text-fm-gold font-extrabold'
                                            : 'border-transparent text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    Codice WhatsApp/SMS
                                </button>
                            </div>

                            {b2cMethod === 'magic_link' ? (
                                <form className="space-y-6" onSubmit={handleMagicLink}>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="email">
                                            Indirizzo Email
                                        </label>
                                        <div className="mt-1">
                                            <input
                                                id="email"
                                                name="email"
                                                type="email"
                                                required
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                className="appearance-none block w-full px-4 py-3 bg-white border border-fm-gold/30 rounded-xl font-body text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all"
                                                placeholder="es. mario.rossi@email.it"
                                            />
                                        </div>
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

                                    <div>
                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className={`w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-[17px] font-semibold text-white bg-fm-gold hover:bg-[#b59870] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fm-gold transition-all duration-300 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        >
                                            {isLoading ? 'Invio in corso...' : 'Invia Link di Accesso'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                /* FORM OTP */
                                <form className="space-y-6" onSubmit={otpStep === 1 ? handleOtpRequest : handleOtpVerify}>
                                    {otpStep === 1 ? (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="otp-identifier">
                                                Email o Numero di Telefono
                                            </label>
                                            <div className="mt-1">
                                                <input
                                                    id="otp-identifier"
                                                    type="text"
                                                    required
                                                    value={otpIdentifier}
                                                    onChange={(e) => setOtpIdentifier(e.target.value)}
                                                    className="appearance-none block w-full px-4 py-3 bg-white border border-fm-gold/30 rounded-xl font-body text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all"
                                                    placeholder="es. mario.rossi@email.it o 3331234567"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 animate-in fade-in">
                                            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs text-slate-600">
                                                Codice inviato a: <strong className="text-slate-800">{otpIdentifier}</strong>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="otp-code">
                                                    Codice di Verifica di 6 Cifre
                                                </label>
                                                <div className="mt-1">
                                                    <input
                                                        id="otp-code"
                                                        type="text"
                                                        maxLength={6}
                                                        pattern="[0-9]*"
                                                        inputMode="numeric"
                                                        required
                                                        value={otpCode}
                                                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                                        className="appearance-none block w-full px-4 py-3 bg-white border border-fm-gold/30 rounded-xl font-body text-center text-lg font-bold tracking-[0.5em] text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all"
                                                        placeholder="000000"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

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

                                    <div>
                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className={`w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-[17px] font-semibold text-white bg-fm-gold hover:bg-[#b59870] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fm-gold transition-all duration-300 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        >
                                            {isLoading
                                                ? 'Elaborazione...'
                                                : otpStep === 1
                                                ? 'Invia Codice Monouso'
                                                : 'Verifica Codice & Accedi'}
                                        </button>
                                    </div>

                                    {otpStep === 2 && (
                                        <div className="text-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOtpStep(1);
                                                    setOtpCode('');
                                                    setErrorMsg('');
                                                    setSuccessMsg('');
                                                }}
                                                className="text-xs text-slate-400 hover:text-slate-600 underline font-semibold transition-colors"
                                            >
                                                Inserisci un numero/email differente
                                            </button>
                                        </div>
                                    )}
                                </form>
                            )}

                            <div className="text-center pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsB2C(false);
                                        setErrorMsg('');
                                        setSuccessMsg('');
                                        setUsername('');
                                    }}
                                    className="text-xs font-semibold text-slate-500 hover:text-fm-gold underline transition-colors"
                                >
                                    Sei un fiorista o membro dello staff? Accedi qui
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* FORM TRADIZIONALE STAFF/PARTNER */
                        <form className="space-y-6" onSubmit={handleLogin}>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="username">
                                    Email o identificativo
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="username"
                                        name="username"
                                        type="text"
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="appearance-none block w-full px-4 py-3 bg-white border border-fm-gold/30 rounded-xl font-body text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all"
                                        placeholder="es. nome@floremoria.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" htmlFor="password">
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
                                        className="appearance-none block w-full px-4 py-3 bg-white border border-fm-gold/30 rounded-xl font-body text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all"
                                        placeholder="• • • •"
                                    />
                                </div>
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
                                    className={`w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-[17px] font-semibold text-white bg-fm-gold hover:bg-[#b59870] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fm-gold transition-all duration-300 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isLoading ? 'Accesso in corso...' : 'Accedi alla Stanza dei Bottoni'}
                                </button>
                            </div>

                            <div className="text-center pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsB2C(true);
                                        setErrorMsg('');
                                        setSuccessMsg('');
                                        setUsername('');
                                    }}
                                    className="text-xs font-semibold text-slate-500 hover:text-fm-gold underline transition-colors"
                                >
                                    Hai acquistato dei fiori? Traccia la consegna senza password
                                </button>
                            </div>
                        </form>
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
