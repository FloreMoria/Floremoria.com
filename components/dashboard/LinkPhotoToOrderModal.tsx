'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    X,
    Search,
    Camera,
    CheckCircle2,
    Loader2,
    MapPin,
    Calendar,
    User,
    Flower2,
    ShoppingBag,
    Tag,
} from 'lucide-react';

interface LinkPhotoToOrderModalProps {
    isOpen: boolean;
    mediaUrl: string;
    caption?: string;
    defaultOrderId?: string | null;
    onClose: () => void;
    onSuccess?: (result: any) => void;
}

function normalizeSearchText(str?: string | null): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatITDate(dateStr?: string | null): string {
    if (!dateStr) return 'Data n.d.';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Data n.d.';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
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
                const res = await fetch('/api/dashboard/orders/search?limit=150', {
                    headers: { 'Cache-Control': 'no-cache' },
                });
                const data = await res.json();
                if (data.ok && Array.isArray(data.orders)) {
                    setOrders(data.orders);
                    if (defaultOrderId) {
                        const match = data.orders.find(
                            (o: any) => o.id === defaultOrderId || o.orderNumber === defaultOrderId
                        );
                        if (match) {
                            setSelectedOrderId(match.id);
                        }
                    } else if (data.orders.length > 0) {
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

    // Ricerca universale tollerante (Case, Accenti, Spaziature)
    const filteredOrders = useMemo(() => {
        if (!searchQuery.trim()) return orders;
        const qNorm = normalizeSearchText(searchQuery);

        return orders.filter((o) => {
            const combinedText = normalizeSearchText(
                [
                    o.orderNumber,
                    o.id,
                    o.deceasedName,
                    o.deceasedProfile?.fullName,
                    o.buyerFullName,
                    o.buyerEmail,
                    o.customerPhone,
                    o.user?.name,
                    o.user?.email,
                    o.partner?.shopName,
                    o.partner?.ownerName,
                    o.cemeteryCity,
                    o.cemeteryName,
                ]
                    .filter(Boolean)
                    .join(' ')
            );

            return combinedText.includes(qNorm);
        });
    }, [orders, searchQuery]);

    if (!isOpen) return null;

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
                            className="w-16 h-16 object-cover rounded-xl border border-slate-200 shrink-0 shadow-sm"
                        />
                        <div className="min-w-0 flex-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                                Immagine Selezionata
                            </span>
                            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate mt-0.5">
                                {caption || 'Foto ricevuta in chat'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                    Tipo Prova:
                                </label>
                                <select
                                    value={kind}
                                    onChange={(e) => setKind(e.target.value as any)}
                                    className="text-[11px] font-bold border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-fm-gold"
                                >
                                    <option value="after">Foto Consegna / Posa (Dopo)</option>
                                    <option value="before">Foto Laboratorio / Posa (Prima)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Barra di ricerca ordini universale */}
                    <div>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Cerca per codice (#FT-...), defunto, cliente, fiorista o cimitero…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-fm-gold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    {/* Lista Ordini Selezionabili (Card Preview Ricche) */}
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                        {loadingOrders ? (
                            <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                <Loader2 size={18} className="animate-spin text-fm-gold" />
                                <span>Caricamento ordini in corso…</span>
                            </div>
                        ) : filteredOrders.length === 0 ? (
                            <div className="py-12 text-center text-xs text-slate-400 italic">
                                Nessun ordine trovato corrisponde alla ricerca.
                            </div>
                        ) : (
                            filteredOrders.map((ord) => {
                                const isSelected = selectedOrderId === ord.id;
                                const buyerName = ord.buyerFullName || ord.user?.name || ord.buyerEmail || 'Cliente sconosciuto';
                                const deceasedName = ord.deceasedName || ord.deceasedProfile?.fullName || 'Defunto non specificato';
                                const cemeteryInfo = [ord.cemeteryName, ord.cemeteryCity].filter(Boolean).join(', ') || 'Cimitero n.d.';
                                const floristName = ord.partner?.shopName || null;
                                const dateFormatted = formatITDate(ord.deliveryDate || ord.createdAt);

                                return (
                                    <div
                                        key={ord.id}
                                        onClick={() => setSelectedOrderId(ord.id)}
                                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                                            isSelected
                                                ? 'border-fm-gold bg-amber-50/50 dark:bg-amber-950/30 ring-2 ring-fm-gold/30'
                                                : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            {/* Riga 1: Badge Codice + Data Consegna */}
                                            <div className="flex items-center gap-2 flex-wrap text-xs">
                                                <span className="font-mono font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-md border border-slate-200 dark:border-slate-600">
                                                    {ord.orderNumber || `#${ord.id.slice(-6).toUpperCase()}`}
                                                </span>
                                                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                                                    <Calendar size={12} className="text-slate-400" />
                                                    {dateFormatted}
                                                </span>
                                            </div>

                                            {/* Riga 2: Nome Defunto + Cimitero */}
                                            <div className="text-xs font-bold text-[#8a7048] flex items-center gap-1.5 truncate">
                                                <span>🕊️ {deceasedName}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                                                <MapPin size={12} className="shrink-0 text-slate-400" />
                                                <span className="truncate">{cemeteryInfo}</span>
                                            </div>

                                            {/* Riga 3: Cliente & Fiorista Incaricato */}
                                            <div className="pt-1 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 flex-wrap">
                                                <span className="flex items-center gap-1 font-medium truncate">
                                                    <User size={12} className="text-slate-400 shrink-0" />
                                                    <span className="truncate">{buyerName}</span>
                                                </span>
                                                {floristName && (
                                                    <span className="flex items-center gap-1 text-amber-900 dark:text-amber-300 font-semibold truncate">
                                                        <Flower2 size={12} className="text-fm-gold shrink-0" />
                                                        <span className="truncate">{floristName}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Radio Indicator */}
                                        <div
                                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                                                isSelected
                                                    ? 'bg-fm-gold border-fm-gold text-white'
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
