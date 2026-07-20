'use client';

import { useState } from 'react';
import { User, Mail, Check, AlertCircle } from 'lucide-react';

export interface UserPersonalDataFormProps {
    initialName: string;
    initialEmail: string;
    emailEditable?: boolean;
    saveEndpoint: string;
    /** Etichetta sezione (default: "I Suoi Dati Personali") */
    sectionTitle?: string;
    /** Mostra solo nome + email (nasconde testo introduttivo esteso) */
    compact?: boolean;
}

export default function UserPersonalDataForm({
    initialName,
    initialEmail,
    emailEditable = true,
    saveEndpoint,
    sectionTitle = 'I Suoi Dati Personali',
    compact = false,
}: UserPersonalDataFormProps) {
    const [name, setName] = useState(initialName);
    const [email, setEmail] = useState(initialEmail);
    const [isLoading, setIsLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const inputClass =
        'w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 focus:ring-2 focus:ring-[#c5a880] focus:border-[#c5a880] outline-none';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setSuccessMsg('');
        setErrorMsg('');

        try {
            const payload: Record<string, string> = { name: name.trim() };
            if (emailEditable) {
                payload.email = email.trim();
            }

            const res = await fetch(saveEndpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setErrorMsg(data.message || 'Impossibile salvare i dati.');
                return;
            }

            if (data.profile) {
                setName(data.profile.name ?? '');
                setEmail(data.profile.email ?? email);
            }

            setSuccessMsg(data.message || 'Dati aggiornati con successo.');

            if (data.emailChanged) {
                window.location.reload();
            }
        } catch {
            setErrorMsg('Errore di connessione al server.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <section className="bg-white/80 backdrop-blur-xl border border-white/60 p-6 sm:p-8 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
            <div className={compact ? 'mb-4' : 'mb-6'}>
                <h2 className="text-lg font-bold text-slate-800 tracking-tight">{sectionTitle}</h2>
                {!compact && (
                    <p className="text-sm text-slate-500 mt-1">
                        L&apos;email è il riferimento per le comunicazioni e per il Suo Giardino della Memoria.
                        Mantenerla aggiornata garantisce la corretta sincronizzazione con i nostri servizi.
                    </p>
                )}
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label
                            className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                            htmlFor="garden-profile-name"
                        >
                            Nome e cognome
                        </label>
                        <div className="relative">
                            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                id="garden-profile-name"
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className={inputClass}
                                placeholder="Es. Luciano Mammì"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label
                            className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                            htmlFor="garden-profile-email"
                        >
                            Email
                        </label>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                id="garden-profile-email"
                                type="email"
                                required
                                readOnly={!emailEditable}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`${inputClass} ${!emailEditable ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                                placeholder="nome@email.it"
                            />
                        </div>
                    </div>
                </div>

                {successMsg && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 font-semibold py-2.5 px-3 rounded-lg">
                        <Check size={14} /> {successMsg}
                    </div>
                )}
                {errorMsg && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 font-semibold py-2.5 px-3 rounded-lg">
                        <AlertCircle size={14} /> {errorMsg}
                    </div>
                )}

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="bg-[#0f172a] hover:bg-black disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md"
                    >
                        {isLoading ? 'Salvataggio...' : 'Salva Dati'}
                    </button>
                </div>
            </form>
        </section>
    );
}
