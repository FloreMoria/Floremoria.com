'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, Camera, CheckCircle2, Loader2, MapPin, Package, User } from 'lucide-react';

interface LinkPhotoToOrderModalProps {
    isOpen: boolean;
    mediaUrl: string;
    caption?: string;
    defaultOrderId?: string | null;
    onClose: () => void;
    onSuccess?: (result: any) => void;
}

export default function LinkPhotoToOrderModal({
    isOpen,
    mediaUrl,
    caption = '',
    defaultOrderId = null,
    onClose,
    onSuccess,
}: LinkPhotoToOrderModalProps) {
    const [orders, setOrders] = useState<any[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string>(defaultOrderId || '');
    const [searchQuery, setSearchQuery] = useState('');
    const [kind, setKind] = useState<'after' | 'before'>('after');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        setSelectedOrderId(defaultOrderId || '');
        setError(null);
        setSuccessMessage(null);

        async function fetchRecentOrders() {
            setLoadingOrders(true);
            try {
                const res = await fetch('/api/dashboard/orders', {
                    headers: { 'Cache-Control': 'no-cache' },
                });
                const data = await res.json();
                if (data.success && Array.isArray(data.orders)) {
                    setOrders(data.orders);
                    if (!defaultOrderId && data.orders.length > 0) {
                        setSelectedOrderId(data.orders[0].id);
                    }
                }
            } catch (err) {
                console.error('[LinkPhotoToOrderModal] Error fetching orders:', err);
                setError('Impossibile caricare la lista degli ordini.');
            } finally {
                setLoadingOrders(false);
            }
        }

        fetchRecentOrders();
    }, [isOpen, defaultOrderId]);

    if (!isOpen) return null;

    const filteredOrders = orders.filter((o) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
            (o.deceasedName && o.deceasedName.toLowerCase().includes(q)) ||
            (o.cemeteryName && o.cemeteryName.toLowerCase().includes(q)) ||
            (o.cemeteryCity && o.cemeteryCity.toLowerCase().includes(q)) ||
            (o.partner?.shopName && o.partner.shopName.toLowerCase().includes(q))
        );
    });

    const handleConfirmLink = async () => {
        if (!selectedOrderId) {
            setError('Seleziona un ordine a cui collegare la foto.');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const res = await fetch(`/api/dashboard/orders/${selectedOrderId}/link-chat-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl,
                    caption,
                    kind,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Errore durante il collegamento della foto.');
            }

            setSuccessMessage(`Foto collegata con successo all'ordine ${data.orderNumber || selectedOrderId}!`);

            if (onSuccess) {
                onSuccess(data);
            }

            setTimeout(() => {
                onClose();
            }, 1200);
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
                        <div className="p-2.5 rounded-xl bg-fm-gold/10 text-fm-gold">
                            <Camera size={20} />
                        </div>
                        <div>
                            <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                                Collega Foto Chat all&apos;Ordine
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Sincronizza su GdM, Scheda Defunto e Registro Fiorista
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
                    {/* Anteprima foto */}
                    <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <img
                            src={mediaUrl}
                            alt="Foto da collegare"
                            className="w-16 h-16 object-cover rounded-xl border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                                Immagine Selezionata
                            </span>
                            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate mt-0.5">
                                {caption || 'Foto inviata in chat'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                    Tipo Prova:
                                </label>
                                <select
                                    value={kind}
                                    onChange={(e) => setKind(e.target.value as any)}
                                    className="text-[11px] font-bold border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 bg-white dark:bg-slate-800"
                                >
                                    <option value="after">Foto Consegna / Posa Piena (Dopo)</option>
                                    <option value="before">Foto Laboratorio / Stato Prima</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Barra di ricerca ordini */}
                    <div>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Cerca per codice ordine, defunto, cimitero o fiorista…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-fm-gold bg-white dark:bg-slate-800"
                            />
                        </div>
                    </div>

                    {/* Lista Ordini Selezionabili */}
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                        {loadingOrders ? (
                            <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                <Loader2 size={16} className="animate-spin text-fm-gold" />
                                <span>Caricamento ordini in corso…</span>
                            </div>
                        ) : filteredOrders.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400 italic">
                                Nessun ordine trovato.
                            </div>
                        ) : (
                            filteredOrders.map((ord) => {
                                const isSelected = selectedOrderId === ord.id;
                                return (
                                    <div
                                        key={ord.id}
                                        onClick={() => setSelectedOrderId(ord.id)}
                                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                            isSelected
                                                ? 'border-fm-gold bg-amber-50/40 dark:bg-amber-950/30 ring-2 ring-fm-gold/30'
                                                : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono font-bold text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md">
                                                    {ord.orderNumber || `#${ord.id.slice(-6).toUpperCase()}`}
                                                </span>
                                                <span className="text-[11px] font-bold text-[#8a7048] truncate">
                                                    🕊️ {ord.deceasedName || 'Defunto'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 truncate">
                                                <MapPin size={12} className="shrink-0 text-slate-400" />
                                                <span>
                                                    {[ord.cemeteryName, ord.cemeteryCity].filter(Boolean).join(', ') || 'Cimitero n.d.'}
                                                </span>
                                                {ord.partner?.shopName && (
                                                    <span className="text-slate-400 ml-1 truncate">
                                                        · Fiorista: {ord.partner.shopName}
                                                    </span>
                                                )}
                                            </p>
                                        </div>

                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                                            isSelected
                                                ? 'bg-fm-gold border-fm-gold text-white'
                                                : 'border-slate-300 dark:border-slate-600'
                                        }`}>
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

                    {successMessage && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl animate-in fade-in flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            <span>{successMessage}</span>
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
                        onClick={handleConfirmLink}
                        disabled={isSaving || !selectedOrderId}
                        className="px-5 py-2 text-xs font-bold text-white bg-fm-gold hover:bg-yellow-600 rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-60"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                <span>Salvataggio…</span>
                            </>
                        ) : (
                            <>
                                <Camera size={14} />
                                <span>Collega all&apos;Ordine</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
