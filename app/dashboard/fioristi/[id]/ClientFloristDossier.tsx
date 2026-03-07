'use client';

import { useState } from 'react';
import { Partner } from '@prisma/client';
import {
    Download, Maximize2,
    Package, Calendar, Euro, AlertCircle, CheckCircle2, X
} from 'lucide-react';
import Image from 'next/image';

import { PaymentStatus, OrderStatus } from '@prisma/client';

interface DossierProps {
    partner: Partner;
    orders: any[];
}

export default function ClientFloristDossier({ partner, orders: initialOrders }: DossierProps) {
    const [orders, setOrders] = useState(initialOrders);

    // Lightbox State
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

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
        <div className="space-y-12 pb-24">

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
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap">Utente</th>
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
                                        <tr><td colSpan={9} className="p-8 text-center text-gray-500">Nessun ordine assegnato a questo fiorista.</td></tr>
                                    ) : (
                                        orders.map((order) => {
                                            const netEarned = Math.floor((order.totalPriceCents / 100) * 0.65);
                                            const productList = order.items?.map((i: any) => i.product?.name).join(', ') || '-';
                                            const hasPhoto = order.photos && order.photos.length > 0;

                                            return (
                                                <tr key={order.id} className="hover:bg-gray-50/50 transition-colors group">
                                                    <td className="py-3 px-4 font-bold text-gray-900 text-xs">#{order.id.slice(-6).toUpperCase()}</td>
                                                    <td className="py-3 px-4 text-gray-800 text-xs font-medium">{order.buyerFullName || order.customerPhone || 'Anonimo'}</td>
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
                                                            onClick={(e) => { e.stopPropagation(); handlePaymentToggle(order.id, order.partnerPaymentStatus || 'UNPAID'); }}
                                                            className={`inline-flex items-center justify-center px-2.5 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all hover:scale-105 active:scale-95 whitespace-nowrap shadow-sm border ${(order.partnerPaymentStatus || 'UNPAID') === 'UNPAID' ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300' :
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
