'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, UserPlus, X } from 'lucide-react';

type FloristOption = { id: string; shopName: string; ownerName: string | null };

type DeceasedRow = {
    fullName: string;
    cemeteryCity: string;
    cemeteryName: string;
    verifiedNotes: string;
    partnerId: string;
};

const emptyDeceased = (): DeceasedRow => ({
    fullName: '',
    cemeteryCity: '',
    cemeteryName: '',
    verifiedNotes: '',
    partnerId: '',
});

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: (payload: { userId: string; email: string; deceasedProfileIds: string[] }) => void;
    florists: FloristOption[];
};

export default function CreateUserModal({ open, onClose, onCreated, florists }: Props) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [deceasedRows, setDeceasedRows] = useState<DeceasedRow[]>([emptyDeceased()]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resetForm = () => {
        setName('');
        setEmail('');
        setPhone('');
        setDeceasedRows([emptyDeceased()]);
        setError(null);
    };

    const updateDeceased = (index: number, patch: Partial<DeceasedRow>) => {
        setDeceasedRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/dashboard/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    email: email || null,
                    phone: phone || null,
                    deceased: deceasedRows.map((row) => ({
                        fullName: row.fullName,
                        cemeteryCity: row.cemeteryCity,
                        cemeteryName: row.cemeteryName || null,
                        verifiedNotes: row.verifiedNotes || null,
                        partnerId: row.partnerId || null,
                    })),
                }),
            });

            const data = (await res.json()) as {
                ok?: boolean;
                userId?: string;
                email?: string;
                deceasedProfileIds?: string[];
                error?: string;
            };

            if (!res.ok || !data.ok || !data.userId) {
                throw new Error(data.error || 'Creazione utente non riuscita.');
            }

            onCreated({
                userId: data.userId,
                email: data.email || email,
                deceasedProfileIds: data.deceasedProfileIds || [],
            });
            resetForm();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore imprevisto.');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                            <UserPlus size={22} /> Nuovo Giardino della Memoria
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Crea un utente con uno o più defunti collegati (senza ordine obbligatorio).
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
                    {error && (
                        <div className="rounded-xl bg-red-50 border border-red-100 text-red-800 text-sm px-4 py-3">
                            {error}
                        </div>
                    )}

                    <section>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Dati cliente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                placeholder="Nome e cognome"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2"
                            />
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <input
                                placeholder="Telefono"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Almeno email o telefono. Solo telefono → email placeholder interna.</p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900">Defunti collegati</h3>
                            <button
                                type="button"
                                onClick={() => setDeceasedRows((rows) => [...rows, emptyDeceased()])}
                                className="text-sm font-semibold text-black flex items-center gap-1 hover:underline"
                            >
                                <Plus size={14} /> Aggiungi defunto
                            </button>
                        </div>

                        {deceasedRows.map((row, index) => (
                            <div key={index} className="border border-gray-100 rounded-2xl p-4 space-y-3 bg-gray-50/40">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold uppercase text-gray-500">
                                        Defunto {index + 1}
                                    </span>
                                    {deceasedRows.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setDeceasedRows((rows) => rows.filter((_, i) => i !== index))
                                            }
                                            className="text-red-500 hover:text-red-700 p-1"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input
                                        required
                                        placeholder="Nome completo defunto *"
                                        value={row.fullName}
                                        onChange={(e) => updateDeceased(index, { fullName: e.target.value })}
                                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2 bg-white"
                                    />
                                    <input
                                        required
                                        placeholder="Comune cimitero *"
                                        value={row.cemeteryCity}
                                        onChange={(e) => updateDeceased(index, { cemeteryCity: e.target.value })}
                                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                    />
                                    <input
                                        placeholder="Nome cimitero"
                                        value={row.cemeteryName}
                                        onChange={(e) => updateDeceased(index, { cemeteryName: e.target.value })}
                                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                    />
                                    <select
                                        value={row.partnerId}
                                        onChange={(e) => updateDeceased(index, { partnerId: e.target.value })}
                                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2 bg-white"
                                    >
                                        <option value="">— Fiorista custode (opzionale) —</option>
                                        {florists.map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.shopName}
                                            </option>
                                        ))}
                                    </select>
                                    <textarea
                                        placeholder="Note verificate (opzionale)"
                                        value={row.verifiedNotes}
                                        onChange={(e) => updateDeceased(index, { verifiedNotes: e.target.value })}
                                        rows={2}
                                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2 bg-white"
                                    />
                                </div>
                            </div>
                        ))}
                    </section>
                </form>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-full text-sm font-semibold text-gray-600 hover:bg-gray-100"
                    >
                        Annulla
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        onClick={handleSubmit}
                        className="px-5 py-2 rounded-full text-sm font-semibold bg-black text-white hover:bg-gray-800 disabled:opacity-60 flex items-center gap-2"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                        Crea utente
                    </button>
                </div>
            </div>
        </div>
    );
}
