'use client';

import { useState } from 'react';
import { User, Mail, Building, Phone, Check, AlertCircle } from 'lucide-react';

export interface ProfileData {
    id: string;
    name: string;
    email: string;
    phone: string;
    company: string;
    vatNumber: string;
    systemRole: string;
    emailReadOnly: boolean;
}

interface ProfileFormProps {
    initialProfile: ProfileData;
}

export default function ProfileForm({ initialProfile }: ProfileFormProps) {
    const [name, setName] = useState(initialProfile.name);
    const [phone, setPhone] = useState(initialProfile.phone);
    const [company, setCompany] = useState(initialProfile.company);
    const [vatNumber, setVatNumber] = useState(initialProfile.vatNumber);
    const [isLoading, setIsLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const inputClass =
        'w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setSuccessMsg('');
        setErrorMsg('');

        try {
            const res = await fetch('/api/dashboard/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, company, vatNumber }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setErrorMsg(data.message || 'Impossibile salvare il profilo.');
                return;
            }

            if (data.profile) {
                setName(data.profile.name ?? '');
                setPhone(data.profile.phone ?? '');
                setCompany(data.profile.company ?? '');
                setVatNumber(data.profile.vatNumber ?? '');
            }
            setSuccessMsg(data.message || 'Profilo aggiornato con successo.');
        } catch {
            setErrorMsg('Errore di connessione al server.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400" htmlFor="profile-name">
                        Nome e cognome
                    </label>
                    <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            id="profile-name"
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={inputClass}
                            placeholder="Es. Mario Rossi"
                        />
                    </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400" htmlFor="profile-email">
                        Email di accesso
                    </label>
                    <div className="relative">
                        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            id="profile-email"
                            type="email"
                            readOnly
                            value={initialProfile.email}
                            className={`${inputClass} bg-gray-100 text-gray-600 cursor-not-allowed`}
                            title={
                                initialProfile.emailReadOnly
                                    ? 'Email di sessione account elevato: non modificabile per preservare il bypass di login.'
                                    : 'Email di accesso gestita dal sistema di autenticazione.'
                            }
                        />
                    </div>
                    {initialProfile.emailReadOnly && (
                        <p className="text-[11px] text-gray-400 leading-snug">
                            Identificativo di sessione riservato. Il login bypass (admin / superadmin) resta indipendente da questi dati anagrafici.
                        </p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400" htmlFor="profile-company">
                        Azienda
                    </label>
                    <div className="relative">
                        <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            id="profile-company"
                            type="text"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            className={inputClass}
                            placeholder="FloreMoria Srl"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400" htmlFor="profile-vat">
                        Partita IVA
                    </label>
                    <div className="relative">
                        <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            id="profile-vat"
                            type="text"
                            value={vatNumber}
                            onChange={(e) => setVatNumber(e.target.value)}
                            className={inputClass}
                            placeholder="IT00000000000"
                        />
                    </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400" htmlFor="profile-phone">
                        Telefono
                    </label>
                    <div className="relative">
                        <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            id="profile-phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className={inputClass}
                            placeholder="+39 320 000 0000"
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

            <div className="pt-4 border-t border-gray-50 flex justify-end">
                <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-gray-900 hover:bg-black disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md"
                >
                    {isLoading ? 'Salvataggio...' : 'Aggiorna Dati'}
                </button>
            </div>
        </form>
    );
}
