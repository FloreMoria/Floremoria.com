'use client';

import { useState } from 'react';
import { Partner } from '@prisma/client';
import {
    Download, Trash2, Send, Maximize2,
    ImagePlus, Package, Calendar, Euro, AlertCircle, CheckCircle2, X
} from 'lucide-react';
import Image from 'next/image';

import { PaymentStatus, OrderStatus } from '@prisma/client';

interface DossierProps {
    partner: Partner;
    orders: any[];
}

export default function ClientFloristDossier({ partner, orders: initialOrders }: DossierProps) {
    const [orders, setOrders] = useState(initialOrders);

    // We will extract photos directly from orders
    const allPhotos = orders.flatMap(o => (o.photos || []).map((url: string, index: number) => ({ id: `${o.id}-${index}`, url, orderId: `#${o.id.slice(-5).toUpperCase()}` })));
    const [photos, setPhotos] = useState(allPhotos);
    const [isDragging, setIsDragging] = useState(false);

    // Lightbox State
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    // Drag & Drop Handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        // In a real app we'd process e.dataTransfer.files
        alert('Foto ricevute nel sistema (Mockup Dropzone)');
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

    const deletePhoto = (id: string) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
        setShowDeleteConfirm(null);
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
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap text-center">Foto</th>
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
                                                    <td className="py-3 px-4 text-center">
                                                        {hasPhoto ? (
                                                            <button onClick={() => setSelectedPhoto(order.photos[0])} className="w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center border border-gray-200 mx-auto transition-colors">
                                                                <ImagePlus size={14} className="text-gray-600" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-400">-</span>
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

                {/* ---------------- OMNICHANNEL PHOTO GALLERY ---------------- */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <ImagePlus size={20} className="text-fm-gold" />
                        Galleria Foto di Consegna (WhatsApp Ready)
                    </h2>

                    {/* Dropzone */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`w-full border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50/50 hover:bg-gray-50'}`}
                    >
                        <ImagePlus size={32} className={`mb-3 transition-colors ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
                        <p className={`font-semibold text-sm transition-colors ${isDragging ? 'text-blue-700' : 'text-gray-700'}`}>
                            Trascina le foto di consegna qui
                        </p>
                        <p className="text-xs text-gray-400 mt-1 font-medium text-center">
                            Oppure in futuro verranno scaricate automaticamente<br />dai Webhook di WhatsApp del fiorista.
                        </p>
                    </div>

                    {/* Photo Grid */}
                    {photos.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
                            {photos.map((photo) => (
                                <div key={photo.id} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
                                    <Image
                                        src={photo.url}
                                        alt={`Foto ${photo.id}`}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                                    />

                                    {/* Action Overlay */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3">
                                        <div className="flex justify-between items-start">
                                            <span className="bg-white/20 backdrop-blur-md px-2 py-1 rounded border border-white/30 text-white text-[10px] font-bold tracking-wider">
                                                {photo.orderId}
                                            </span>
                                            <button
                                                onClick={() => setSelectedPhoto(photo.url)}
                                                className="p-1.5 bg-white/20 hover:bg-white text-white hover:text-black rounded-lg transition-colors backdrop-blur-md"
                                                title="Espandi"
                                            >
                                                <Maximize2 size={16} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-center gap-2 mt-auto">
                                            <button
                                                onClick={() => alert(`Download trigger per ${photo.url}`)}
                                                className="p-2 bg-white/10 hover:bg-white text-white hover:text-black rounded-full transition-colors backdrop-blur-md border border-white/20"
                                                title="Scarica"
                                            >
                                                <Download size={16} />
                                            </button>
                                            <button
                                                onClick={() => setShowDeleteConfirm(photo.id)}
                                                className="p-2 bg-white/10 hover:bg-red-500 text-white rounded-full transition-colors backdrop-blur-md border border-white/20"
                                                title="Elimina"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => alert('Modulo Inoltro WhatsApp Manuale')}
                                                className="p-2 bg-white/10 hover:bg-blue-500 text-white rounded-full transition-colors backdrop-blur-md border border-white/20"
                                                title="Inoltra Manualmente via WA"
                                            >
                                                <Send size={16} className="-ml-0.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Delete Confirmation Popup Overlay */}
                                    {showDeleteConfirm === photo.id && (
                                        <div className="absolute inset-0 bg-red-600/90 z-10 flex flex-col items-center justify-center p-4 text-center">
                                            <AlertCircle size={32} className="text-white mb-2" />
                                            <p className="text-white text-xs font-bold mb-3">Eliminare defintivamente?</p>
                                            <div className="flex gap-2 w-full">
                                                <button onClick={() => deletePhoto(photo.id)} className="flex-1 bg-white text-red-600 rounded py-1.5 text-xs font-bold hover:bg-red-50">SÌ</button>
                                                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 bg-red-700 text-white rounded py-1.5 text-xs font-bold hover:bg-red-800">NO</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            Nessuna foto associata a questo partner.
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Lightbox (Full Screen) */}
            {selectedPhoto && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
                    <button
                        className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white text-white hover:text-black rounded-full transition-colors backdrop-blur-md border border-white/20"
                        onClick={(e) => { e.stopPropagation(); setSelectedPhoto(null); }}
                    >
                        <X size={24} />
                    </button>
                    <div className="relative w-full max-w-5xl h-full max-h-[85vh] rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <Image
                            src={selectedPhoto}
                            alt="Ingrandimento Foto Consegna"
                            fill
                            className="object-contain"
                            quality={100}
                        />
                    </div>
                </div>
            )}

        </div>
    );
}
