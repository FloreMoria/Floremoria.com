'use client';

import { useState } from 'react';
import { recoverGardenLink } from '@/app/actions/recover-garden';
import Link from 'next/link';

export default function RecoverForm() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !email.includes('@')) return;

        setStatus('loading');
        try {
            const response = await recoverGardenLink(email);
            // Il server action restituisce sempre true se è passata un'email valida per motivi di blocco enumerazione account
            if (response.success) {
                setStatus('success');
                setMessage(response.message);
                setEmail('');
            } else {
                setStatus('error');
                setMessage(response.message);
            }
        } catch (error) {
            setStatus('error');
            setMessage('Si è verificato un errore strano. Verifica la tua connessione.');
        }
    };

    if (status === 'success') {
        return (
            <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-2xl font-display font-medium text-fm-text">Tutto Sistemato.</h3>
                <p className="text-fm-muted font-body leading-relaxed">
                    {message}
                </p>
                <Link href="/"
                    className="inline-block w-full py-4 px-6 border border-fm-gold/30 rounded-xl text-fm-text hover:bg-fm-section transition-colors font-medium">
                    Torna alla Home
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 tracking-wide mb-2">
                    Inserisci il tuo indirizzo Email
                </label>
                <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="La tua email (es. mario.rossi@gmail.com)"
                    required
                    className="appearance-none block w-full px-4 py-4 bg-[#FAF9F6] border border-fm-gold/30 rounded-xl font-body text-fm-text shadow-inner focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold transition-all"
                />
            </div>

            <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-md text-[17px] font-semibold text-white bg-fm-gold hover:bg-yellow-600 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fm-gold transition-all duration-300 disabled:opacity-70 disabled:hover:translate-y-0"
            >
                {status === 'loading' ? (
                    <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Ricerca in corso...
                    </>
                ) : (
                    'Ritrova il mio Giardino'
                )}
            </button>

            {status === 'error' && (
                <div className="p-4 rounded-xl bg-red-50 text-red-800 text-sm font-medium border border-red-200 text-center animate-fade-in-up">
                    {message}
                </div>
            )}
        </form>
    );
}
