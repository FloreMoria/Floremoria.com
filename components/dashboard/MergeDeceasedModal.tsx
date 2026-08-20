'use client';

import React, { useState } from 'react';
import { X, Search, GitMerge, CheckCircle2, Loader2, User, AlertTriangle } from 'lucide-react';

interface MergeDeceasedModalProps {
    isOpen: boolean;
    masterProfile: { id: string; fullName: string; cemeteryCity?: string };
    allProfiles: { id: string; fullName: string; cemeteryCity?: string; orders?: any[]; deliveryPhotoUrls?: string[] }[];
    onClose: () => void;
    onSuccess: (result: any) => void;
}

export default function MergeDeceasedModal({
    isOpen,
    masterProfile,
    allProfiles = [],
    onClose,
    onSuccess,
}: MergeDeceasedModalProps) {
    const [selectedDupIds, setSelectedDupIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    if (!isOpen || !masterProfile) return null;

    const availableProfiles = allProfiles.filter((p) => p.id !== masterProfile.id);

    const filteredProfiles = availableProfiles.filter((p) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            p.fullName.toLowerCase().includes(q) ||
            (p.cemeteryCity && p.cemeteryCity.toLowerCase().includes(q))
        );
    });

    const toggleSelect = (id: string) => {
        setSelectedDupIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    const handleConfirmMerge = async () => {
        if (selectedDupIds.length === 0) {
            setError('Seleziona almeno un profilo duplicato da unire.');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/dashboard/defunti/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterProfileId: masterProfile.id,
                    duplicateProfileIds: selectedDupIds,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Errore durante l\'unione dei profili.');
            }

            setSuccessMsg(`Unione completata con successo! ${data.mergedProfileCount} profili accorpati.`);

            onSuccess(data);

            setTimeout(() => {
                onClose();
            }, 1400);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore sconosciuto.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col border border-slate-100 dark:border-slate-800 max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                            <GitMerge size={20} />
                        </div>
                        <div>
                            <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                                Unisci Profili Defunto
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Profilo Master: <span className="font-bold text-slate-800 dark:text-slate-200">{masterProfile.fullName}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-2xl flex items-start gap-2.5 text-amber-900 dark:text-amber-200 text-xs">
                        <AlertTriangle size={16} className="shrink-0 text-amber-600 mt-0.5" />
                        <div>
                            <p className="font-semibold">Nessun dato andrà perso.</p>
                            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                                Gli ordini, le foto di garanzia e le memorie del Giardino verranno trasferiti su <strong>{masterProfile.fullName}</strong>. I profili duplicati verranno archiviati mantenendo la tracciabilità storica.
                            </p>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Cerca profili duplicati per nome o cimitero…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-slate-800"
                        />
                    </div>

                    {/* Profiles Selection List */}
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                        {filteredProfiles.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400 italic">
                                Nessun altro profilo trovato.
                            </div>
                        ) : (
                            filteredProfiles.map((p) => {
                                const isSelected = selectedDupIds.includes(p.id);
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => toggleSelect(p.id)}
                                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                            isSelected
                                                ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/40 ring-2 ring-purple-500/30'
                                                : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                                                {p.fullName.charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                                                    {p.fullName}
                                                </div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                    {p.cemeteryCity || 'Comune n.d.'} · Ordini: {p.orders?.length || 0}
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                                isSelected
                                                    ? 'bg-purple-600 border-purple-600 text-white'
                                                    : 'border-slate-300 dark:border-slate-600'
                                            }`}
                                        >
                                            {isSelected && <CheckCircle2 size={14} />}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {error && (
                        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl animate-in fade-in">
                            ⚠️ {error}
                        </div>
                    )}

                    {successMsg && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl animate-in fade-in flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            <span>{successMsg}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-800/40">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                    >
                        Annulla
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirmMerge}
                        disabled={isSaving || selectedDupIds.length === 0}
                        className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-60"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                <span>Unione in corso…</span>
                            </>
                        ) : (
                            <>
                                <GitMerge size={14} />
                                <span>Unisci {selectedDupIds.length} Profili</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
