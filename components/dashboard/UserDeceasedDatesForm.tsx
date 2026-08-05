'use client';

import { useState } from 'react';
import { Calendar, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toDateInputValue } from '@/lib/deceased/deceasedProfileFormUtils';

type Props = {
    deceasedProfileId: string;
    deceasedName: string;
    initialBirthDate?: string | null;
    initialDeathDate?: string | null;
};

/**
 * Date commemorative sul singolo defunto nel Giardino (non sui dati personali Utente).
 */
export default function UserDeceasedDatesForm({
    deceasedProfileId,
    deceasedName,
    initialBirthDate = '',
    initialDeathDate = '',
}: Props) {
    const [birthDate, setBirthDate] = useState(toDateInputValue(initialBirthDate));
    const [deathDate, setDeathDate] = useState(toDateInputValue(initialDeathDate));
    const [isLoading, setIsLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const dateInputClass =
        'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 focus:ring-2 focus:ring-[#c5a880] focus:border-[#c5a880] outline-none';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setSuccessMsg('');
        setErrorMsg('');

        try {
            const res = await fetch(
                `/api/dashboard/user/deceased/${encodeURIComponent(deceasedProfileId)}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        birthDate: birthDate || null,
                        deathDate: deathDate || null,
                    }),
                }
            );
            const data = (await res.json()) as {
                success?: boolean;
                message?: string;
                deceased?: { birthDate?: string | null; deathDate?: string | null };
            };

            if (!res.ok || !data.success) {
                setErrorMsg(data.message || 'Impossibile salvare le date.');
                return;
            }

            setBirthDate(toDateInputValue(data.deceased?.birthDate ?? birthDate));
            setDeathDate(toDateInputValue(data.deceased?.deathDate ?? deathDate));
            setSuccessMsg(data.message || 'Date aggiornate con cura.');
        } catch {
            setErrorMsg('Errore di connessione al server.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-100 bg-white/90 p-4 sm:p-5 space-y-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)]"
        >
            <div className="flex items-start gap-2">
                <Calendar size={16} className="text-[#c5a880] mt-0.5 shrink-0" />
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Date commemorative
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">
                        Per {deceasedName}: ci aiutano a ricordarLe le ricorrenze con discrezione.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label
                        className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                        htmlFor={`deceased-birth-${deceasedProfileId}`}
                    >
                        Data di nascita
                    </label>
                    <input
                        id={`deceased-birth-${deceasedProfileId}`}
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className={dateInputClass}
                    />
                </div>
                <div className="space-y-1.5">
                    <label
                        className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                        htmlFor={`deceased-death-${deceasedProfileId}`}
                    >
                        Data di morte / commemorazione
                    </label>
                    <input
                        id={`deceased-death-${deceasedProfileId}`}
                        type="date"
                        value={deathDate}
                        onChange={(e) => setDeathDate(e.target.value)}
                        className={dateInputClass}
                    />
                </div>
            </div>

            {successMsg ? (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 font-semibold py-2.5 px-3 rounded-lg">
                    <Check size={14} /> {successMsg}
                </div>
            ) : null}
            {errorMsg ? (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 font-semibold py-2.5 px-3 rounded-lg">
                    <AlertCircle size={14} /> {errorMsg}
                </div>
            ) : null}

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 bg-[#0f172a] hover:bg-black disabled:opacity-60 text-white px-5 py-2 rounded-xl font-medium text-sm transition-all"
                >
                    {isLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                    {isLoading ? 'Salvataggio…' : 'Salva date'}
                </button>
            </div>
        </form>
    );
}
