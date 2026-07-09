'use client';

import { useState } from 'react';
import { Partner } from '@prisma/client';
import {
    Download, Maximize2,
    Package, Calendar, Euro, AlertCircle, CheckCircle2, X, Link2, Pencil, Trash2, Save
} from 'lucide-react';
import Image from 'next/image';
import ShareableLinkPanel from '@/components/dashboard/ShareableLinkPanel';
import { isOrderCancelled } from '@/lib/dashboardOrdersFilter';

import { PaymentStatus, OrderStatus } from '@prisma/client';

const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
    { value: 'ACCEPTED', label: 'Ricevuto' },
    { value: 'IN_PROGRESS', label: 'In lavorazione' },
    { value: 'DELIVERING', label: 'In consegna' },
    { value: 'COMPLETED', label: 'Completato' },
    { value: 'PENDING', label: 'In attesa' },
    { value: 'CANCELLED', label: 'Annullato' },
];

type OrderEditDraft = {
    cemeteryName: string;
    cemeteryCity: string;
    gravePosition: string;
    deliveryDate: string;
    deceasedName: string;
    buyerFullName: string;
    customerPhone: string;
    status: OrderStatus;
};

interface DossierProps {
    partner: Partner;
    orders: any[];
}

export default function ClientFloristDossier({ partner, orders: initialOrders }: DossierProps) {
    const [orders, setOrders] = useState(initialOrders);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [orderDraft, setOrderDraft] = useState<Record<string, OrderEditDraft>>({});
    const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    // Lightbox State
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

    const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3200);
    };

    const toDatetimeLocal = (value: string | Date | null | undefined): string => {
        if (!value) return '';
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const beginOrderEdit = (order: any) => {
        setEditingOrderId(order.id);
        setOrderDraft((prev) => ({
            ...prev,
            [order.id]: {
                cemeteryName: order.cemeteryName || '',
                cemeteryCity: order.cemeteryCity || '',
                gravePosition: order.gravePosition || '',
                deliveryDate: toDatetimeLocal(order.deliveryDate),
                deceasedName: order.deceasedName || '',
                buyerFullName: order.buyerFullName || '',
                customerPhone: order.customerPhone || '',
                status: order.status || 'ACCEPTED',
            },
        }));
    };

    const cancelOrderEdit = () => {
        setEditingOrderId(null);
    };

    const patchOrderInState = (orderId: string, patch: Record<string, unknown>) => {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    };

    const saveOrderEdit = async (order: any) => {
        const draft = orderDraft[order.id];
        if (!draft) return;

        setSavingOrderId(order.id);
        try {
            const res = await fetch(`/api/dashboard/orders/${order.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cemeteryName: draft.cemeteryName,
                    cemeteryCity: draft.cemeteryCity,
                    gravePosition: draft.gravePosition || null,
                    deliveryDate: draft.deliveryDate || null,
                    deceasedName: draft.deceasedName,
                    buyerFullName: draft.buyerFullName,
                    customerPhone: draft.customerPhone,
                    status: draft.status,
                }),
            });
            if (!res.ok) {
                throw new Error('Salvataggio non riuscito.');
            }
            const updated = await res.json();
            const patch =
                draft.status === 'CANCELLED' || updated.deletedAt
                    ? {
                          ...draft,
                          status: 'CANCELLED',
                          deletedAt: updated.deletedAt ?? new Date().toISOString(),
                      }
                    : {
                          ...draft,
                          deliveryDate: updated.deliveryDate ?? draft.deliveryDate,
                      };
            patchOrderInState(order.id, patch);
            setEditingOrderId(null);
            showToast(
                draft.status === 'CANCELLED' ? 'Ordine annullato' : 'Ordine aggiornato'
            );
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore salvataggio ordine.');
        } finally {
            setSavingOrderId(null);
        }
    };

    const cancelAssignedOrder = async (order: any) => {
        const ok = window.confirm(
            `Confermi cancellazione ordine ${order.orderNumber || order.id}?`
        );
        if (!ok) return;

        setSavingOrderId(order.id);
        try {
            const res = await fetch(`/api/dashboard/orders/${order.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || 'Cancellazione non riuscita.');
            }
            const cancelledAt = data.order?.deletedAt ?? new Date().toISOString();
            patchOrderInState(order.id, { status: 'CANCELLED', deletedAt: cancelledAt });
            setEditingOrderId(null);
            showToast('Ordine cancellato');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Errore cancellazione ordine.');
        } finally {
            setSavingOrderId(null);
        }
    };

    const getStatusColor = (status: OrderStatus) => {
        switch (status) {
            case 'COMPLETED': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
            case 'DELIVERING': return 'text-amber-700 bg-amber-50 border-amber-200';
            case 'CANCELLED': return 'text-red-700 bg-red-50 border-red-200';
            case 'PENDING':
            case 'ACCEPTED':
            case 'IN_PROGRESS': return 'text-blue-700 bg-blue-50 border-blue-200';
            default: return 'text-gray-700 bg-gray-50 border-gray-200';
        }
    };

    const getStatusIcon = (status: OrderStatus) => {
        switch (status) {
            case 'COMPLETED': return <CheckCircle2 size={14} className="text-emerald-500" />;
            case 'DELIVERING': return <AlertCircle size={14} className="text-amber-500" />; // Or delivery icon
            case 'PENDING':
            case 'ACCEPTED':
            case 'IN_PROGRESS': return <Calendar size={14} className="text-blue-500" />;
            default: return <AlertCircle size={14} className="text-gray-500" />;
        }
    };

    const translateStatus = (status: OrderStatus) => {
        switch (status) {
            case 'COMPLETED': return 'Consegnato';
            case 'DELIVERING': return 'In Consegna';
            case 'IN_PROGRESS': return 'In Lavorazione';
            case 'ACCEPTED': return 'Accettato';
            case 'PENDING': return 'In Attesa';
            case 'CANCELLED': return 'Annullato';
            default: return status;
        }
    };

    const handlePaymentToggle = async (orderId: string, currentStatus: PaymentStatus) => {
        const nextStatus = currentStatus === 'UNPAID' ? 'PROCESSING' : currentStatus === 'PROCESSING' ? 'PAID' : 'UNPAID';

        try {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, partnerPaymentStatus: nextStatus } : o));
            const res = await fetch(`/api/dashboard/orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partnerPaymentStatus: nextStatus })
            });
            if (!res.ok) throw new Error('Failed to update');
        } catch (error) {
            console.error(error);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, partnerPaymentStatus: currentStatus } : o));
            alert("Errore nell'aggiornamento del pagamento");
        }
    };

    return (
        <div className="space-y-8">
            {toast ? (
                <div className="fixed bottom-6 right-6 z-[90] bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg">
                    {toast}
                </div>
            ) : null}

            {/* GRID LAYOUT: Orders (Full) then Gallery (Full) */}
            <div className="flex flex-col gap-12">

                {/* ---------------- STORICO ORDINI ---------------- */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Package size={20} className="text-blue-500" />
                        Registro Consegne
                    </h2>

                    <div className="bg-white border text-left border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto w-full custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50/70 border-b border-gray-100 text-gray-500">
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap">ID Ordine</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap">Defunto</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap">Consegna</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider min-w-[150px]">Prodotto/i</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap text-right">Prezzo al Fiorista</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap text-center">Foto Consegna (WA Ready)</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap text-center">Stato Ordine</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap text-center">Pagamento</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {orders.length === 0 ? (
                                        <tr><td colSpan={8} className="p-8 text-center text-gray-500">Nessun ordine assegnato a questo fiorista.</td></tr>
                                    ) : (
                                        orders.map((order) => {
                                            const netEarned = Math.floor((order.totalPriceCents / 100) * 0.65);
                                            const productList = order.items?.map((i: any) => i.product?.name).join(', ') || '-';
                                            const hasPhoto = order.photos && order.photos.length > 0;
                                            const cancelled = isOrderCancelled(order);

                                            return (
                                                <tr
                                                    key={order.id}
                                                    className={`transition-colors cursor-pointer ${
                                                        cancelled
                                                            ? 'bg-red-50/80'
                                                            : selectedOrderId === order.id
                                                              ? 'bg-blue-50/60'
                                                              : 'hover:bg-gray-50/50 group'
                                                    }`}
                                                    onClick={() => setSelectedOrderId((prev) => (prev === order.id ? null : order.id))}
                                                >
                                                    <td className="py-3 px-4 font-bold text-xs">
                                                        <span className={cancelled ? 'text-red-800 line-through' : 'text-gray-900'}>
                                                            {order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`}
                                                        </span>
                                                        {cancelled ? (
                                                            <span className="ml-2 text-[10px] font-bold uppercase text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                                                Annullato
                                                            </span>
                                                        ) : null}
                                                    </td>
                                                    <td className="py-3 px-4 text-gray-600 font-medium text-xs">{order.deceasedName || '-'}</td>
                                                    <td className="py-3 px-4 text-gray-600 text-[11px] leading-tight max-w-[120px]">
                                                        <div className="font-semibold text-gray-800">{order.cemeteryCity || '-'}</div>
                                                        <div>{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'Da definire'}</div>
                                                    </td>
                                                    <td className="py-3 px-4 font-medium text-gray-800 text-xs truncate max-w-[200px]" title={productList}>{productList}</td>
                                                    <td className="py-3 px-4 text-right font-semibold text-gray-900 whitespace-nowrap">
                                                        <span className="flex items-center justify-end gap-0.5 text-sm">
                                                            <Euro size={14} className="text-fm-gold" />{netEarned.toFixed(2)}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-center align-middle">
                                                        {hasPhoto ? (
                                                            <button onClick={(e) => { e.stopPropagation(); setSelectedPhoto(order.photos[0]); }} className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:ring-2 hover:ring-fm-gold transition-all mx-auto group block">
                                                                <Image src={order.photos[0]} alt="Foto Consegna" fill className="object-cover group-hover:scale-110 transition-transform duration-300" />
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                                    <Maximize2 size={12} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                </div>
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs">-</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border ${getStatusColor(order.status)} whitespace-nowrap`}>
                                                            {getStatusIcon(order.status)} {translateStatus(order.status)}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); if (!cancelled) handlePaymentToggle(order.id, order.partnerPaymentStatus || 'UNPAID'); }}
                                                            disabled={cancelled}
                                                            className={`inline-flex items-center justify-center px-2.5 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all hover:scale-105 active:scale-95 whitespace-nowrap shadow-sm border disabled:opacity-40 disabled:cursor-not-allowed ${(order.partnerPaymentStatus || 'UNPAID') === 'UNPAID' ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300' :
                                                                order.partnerPaymentStatus === 'PROCESSING' ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 hover:border-orange-300' :
                                                                    'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                                                                }`}
                                                        >
                                                            {(order.partnerPaymentStatus || 'UNPAID') === 'UNPAID' ? 'Da Pagare' :
                                                                order.partnerPaymentStatus === 'PROCESSING' ? 'In Pagamento' : 'Pagato'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {selectedOrder ? (
                        <div className={`rounded-2xl border p-5 space-y-4 animate-in fade-in ${
                            isOrderCancelled(selectedOrder)
                                ? 'border-red-200 bg-red-50/40'
                                : 'border-blue-100 bg-blue-50/30'
                        }`}>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
                                        isOrderCancelled(selectedOrder) ? 'text-red-600' : 'text-blue-600'
                                    }`}>
                                        <Link2 size={12} /> Dettaglio ordine assegnato
                                    </p>
                                    <h3 className="text-lg font-bold text-gray-900 mt-1">
                                        {selectedOrder.orderNumber || `#${selectedOrder.id.slice(-6).toUpperCase()}`} — {selectedOrder.deceasedName}
                                    </h3>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {selectedOrder.cemeteryName}, {selectedOrder.cemeteryCity}
                                        {selectedOrder.deliveryDate
                                            ? ` · Consegna ${new Date(selectedOrder.deliveryDate).toLocaleDateString('it-IT')}`
                                            : ''}
                                    </p>
                                    {isOrderCancelled(selectedOrder) ? (
                                        <p className="text-sm text-red-700 font-medium mt-2">
                                            Ordine annullato — non più attivo per il fiorista.
                                        </p>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {!isOrderCancelled(selectedOrder) && editingOrderId !== selectedOrder.id ? (
                                        <button
                                            type="button"
                                            onClick={() => beginOrderEdit(selectedOrder)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                                        >
                                            <Pencil size={14} /> Modifica
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedOrderId(null);
                                            setEditingOrderId(null);
                                        }}
                                        className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-white border border-transparent hover:border-gray-200"
                                        aria-label="Chiudi dettaglio"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            {editingOrderId === selectedOrder.id && orderDraft[selectedOrder.id] ? (
                                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                                    <h4 className="text-sm font-bold text-gray-900">Modifica ordine</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <input
                                            placeholder="Nome defunto"
                                            value={orderDraft[selectedOrder.id]!.deceasedName}
                                            onChange={(e) =>
                                                setOrderDraft((prev) => ({
                                                    ...prev,
                                                    [selectedOrder.id]: { ...prev[selectedOrder.id]!, deceasedName: e.target.value },
                                                }))
                                            }
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <input
                                            placeholder="Cliente"
                                            value={orderDraft[selectedOrder.id]!.buyerFullName}
                                            onChange={(e) =>
                                                setOrderDraft((prev) => ({
                                                    ...prev,
                                                    [selectedOrder.id]: { ...prev[selectedOrder.id]!, buyerFullName: e.target.value },
                                                }))
                                            }
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <input
                                            placeholder="Telefono"
                                            value={orderDraft[selectedOrder.id]!.customerPhone}
                                            onChange={(e) =>
                                                setOrderDraft((prev) => ({
                                                    ...prev,
                                                    [selectedOrder.id]: { ...prev[selectedOrder.id]!, customerPhone: e.target.value },
                                                }))
                                            }
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <select
                                            value={orderDraft[selectedOrder.id]!.status}
                                            onChange={(e) =>
                                                setOrderDraft((prev) => ({
                                                    ...prev,
                                                    [selectedOrder.id]: {
                                                        ...prev[selectedOrder.id]!,
                                                        status: e.target.value as OrderStatus,
                                                    },
                                                }))
                                            }
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        >
                                            {ORDER_STATUS_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            placeholder="Cimitero"
                                            value={orderDraft[selectedOrder.id]!.cemeteryName}
                                            onChange={(e) =>
                                                setOrderDraft((prev) => ({
                                                    ...prev,
                                                    [selectedOrder.id]: { ...prev[selectedOrder.id]!, cemeteryName: e.target.value },
                                                }))
                                            }
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <input
                                            placeholder="Comune"
                                            value={orderDraft[selectedOrder.id]!.cemeteryCity}
                                            onChange={(e) =>
                                                setOrderDraft((prev) => ({
                                                    ...prev,
                                                    [selectedOrder.id]: { ...prev[selectedOrder.id]!, cemeteryCity: e.target.value },
                                                }))
                                            }
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <input
                                            placeholder="Loculo / posizione"
                                            value={orderDraft[selectedOrder.id]!.gravePosition}
                                            onChange={(e) =>
                                                setOrderDraft((prev) => ({
                                                    ...prev,
                                                    [selectedOrder.id]: { ...prev[selectedOrder.id]!, gravePosition: e.target.value },
                                                }))
                                            }
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
                                        />
                                        <input
                                            type="datetime-local"
                                            value={orderDraft[selectedOrder.id]!.deliveryDate}
                                            onChange={(e) =>
                                                setOrderDraft((prev) => ({
                                                    ...prev,
                                                    [selectedOrder.id]: { ...prev[selectedOrder.id]!, deliveryDate: e.target.value },
                                                }))
                                            }
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-end">
                                        <button
                                            type="button"
                                            onClick={cancelOrderEdit}
                                            className="px-4 py-2 rounded-full text-sm font-semibold text-gray-600 hover:bg-gray-100"
                                        >
                                            Annulla modifiche
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void cancelAssignedOrder(selectedOrder)}
                                            disabled={savingOrderId === selectedOrder.id}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                                        >
                                            <Trash2 size={14} /> Cancella ordine
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void saveOrderEdit(selectedOrder)}
                                            disabled={savingOrderId === selectedOrder.id}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-black text-white hover:bg-gray-800 disabled:opacity-50"
                                        >
                                            <Save size={14} />
                                            {savingOrderId === selectedOrder.id ? 'Salvataggio…' : 'Salva'}
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {selectedOrder.floristDeliveryUrl && !isOrderCancelled(selectedOrder) ? (
                                <ShareableLinkPanel
                                    label="Link mini-app fiorista (foto consegna)"
                                    url={selectedOrder.floristDeliveryUrl}
                                    hint="Stesso link inviato via WhatsApp al fiorista. Valido finché l'ordine è attivo."
                                    whatsappPhone={partner.whatsappNumber}
                                    whatsappIntro={`Ciao, ecco il link FloreMoria per caricare le foto di consegna — ordine ${selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()} per ${selectedOrder.deceasedName}:`}
                                />
                            ) : null}
                        </div>
                    ) : null}
                </div>

            </div>

            {/* Modal Lightbox (Full Screen) */}
            {selectedPhoto && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
                    <button
                        className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white text-white hover:text-black rounded-full transition-colors backdrop-blur-md border border-white/20 z-[110]"
                        onClick={(e) => { e.stopPropagation(); setSelectedPhoto(null); }}
                    >
                        <X size={24} />
                    </button>
                    <div className="relative flex flex-col items-center w-full max-w-5xl h-full max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl mb-6">
                            <Image
                                src={selectedPhoto}
                                alt="Ingrandimento Foto Consegna"
                                fill
                                className="object-contain"
                                quality={100}
                            />
                        </div>
                        <button
                            onClick={() => {
                                alert(`Download avviato per: ${selectedPhoto}`);
                            }}
                            className="flex-shrink-0 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-full font-bold shadow-lg transition-transform hover:scale-105 z-[110]"
                        >
                            <Download size={20} />
                            Scarica per WhatsApp
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
