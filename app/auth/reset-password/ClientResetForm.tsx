'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
    token: string;
}

export default function ClientResetForm({ token }: Props) {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Requisiti di sicurezza
    const hasMinLen = password.length >= 8;
    const hasNumber = /[0-9]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const matches = password === confirmPassword && confirmPassword.length > 0;

    const isValid = hasMinLen && hasNumber && hasUpper && matches;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid) return;

        setIsSubmitting(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                router.push(data.redirectUrl || '/dashboard');
                router.refresh();
            } else {
                setErrorMsg(data.message || 'Errore durante il ripristino della password.');
            }
        } catch {
            setErrorMsg('Errore di rete. Controlla la tua connessione.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
                <div className="rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-700 border border-red-100">
                    {errorMsg}
                </div>
            )}

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nuova Password</label>
                <div className="relative">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Inserisci la password..."
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-black text-sm"
                        required
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Conferma Password</label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Conferma la password..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-black text-sm"
                    required
                />
            </div>

            {/* Indicatori requisiti */}
            <div className="p-4 bg-slate-50 rounded-2xl space-y-2 border border-slate-100 text-xs">
                <p className="font-bold text-slate-400 uppercase tracking-wider text-[9px] mb-2">Requisiti di sicurezza:</p>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${hasMinLen ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={hasMinLen ? 'text-slate-800' : 'text-slate-500'}>Almeno 8 caratteri</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${hasNumber ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={hasNumber ? 'text-slate-800' : 'text-slate-500'}>Almeno un numero</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${hasUpper ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={hasUpper ? 'text-slate-800' : 'text-slate-500'}>Almeno una lettera maiuscola</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${matches ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={matches ? 'text-slate-800' : 'text-slate-500'}>Le password coincidono</span>
                </div>
            </div>

            <button
                type="submit"
                disabled={!isValid || isSubmitting}
                className="w-full bg-black hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-colors shadow-sm mt-4 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
                {isSubmitting ? 'Salvataggio in corso...' : 'Reimposta Password & Accedi'}
            </button>
        </form>
    );
}
