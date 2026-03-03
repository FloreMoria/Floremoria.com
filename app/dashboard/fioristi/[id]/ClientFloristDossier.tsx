'use client';

import { useState } from 'react';
import { Partner } from '@prisma/client';
import {
    Download, Trash2, Send, Maximize2,
    ImagePlus, Package, Calendar, Euro, AlertCircle, CheckCircle2, X
} from 'lucide-react';
import Image from 'next/image';

interface DossierProps {
    partner: Partner;
}

// Mock Orders
const MOCK_ORDERS = [
    { id: '#1024', date: '2026-03-01', product: 'Bouquet Tributo Eterno', amount: 89.90, status: 'Consegnato' },
    { id: '#1029', date: '2026-03-02', product: 'Cuscino Luce Serena', amount: 145.00, status: 'In Attesa' },
    { id: '#1033', date: '2026-03-03', product: 'Corona Memoria', amount: 250.00, status: 'Problema' }
];

// Mock Photos
const MOCK_PHOTOS = [
    { id: '1', url: 'https://images.unsplash.com/photo-1563241527-3004b7be0ffd?q=80&w=400&auto=format&fit=crop', date: '2026-03-01', orderId: '#1024' },
    { id: '2', url: 'https://images.unsplash.com/photo-1582794543139-8ac9cb0f7b11?q=80&w=400&auto=format&fit=crop', date: '2026-03-01', orderId: '#1024' },
    { id: '3', url: 'https://images.unsplash.com/photo-1542458872-9b266391d171?q=80&w=400&auto=format&fit=crop', date: '2026-02-28', orderId: '#0998' }
];

export default function ClientFloristDossier({ partner }: DossierProps) {
    const [photos, setPhotos] = useState(MOCK_PHOTOS);
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Consegnato': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
            case 'In Attesa': return 'text-amber-700 bg-amber-50 border-amber-200';
            case 'Problema': return 'text-red-700 bg-red-50 border-red-200';
            default: return 'text-gray-700 bg-gray-50 border-gray-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Consegnato': return <CheckCircle2 size={14} className="text-emerald-500" />;
            case 'In Attesa': return <Calendar size={14} className="text-amber-500" />;
            case 'Problema': return <AlertCircle size={14} className="text-red-500" />;
            default: return null;
        }
    };

    const deletePhoto = (id: string) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
        setShowDeleteConfirm(null);
    };

    return (
        <div className="space-y-12 pb-24">

            {/* GRID LAYOUT: Orders (Left) + Gallery (Right) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

                {/* ---------------- STORICO ORDINI ---------------- */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Package size={20} className="text-blue-500" />
                        Storico Ordini Recenti
                    </h2>

                    <div className="bg-white border text-left border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto w-full custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50/70 border-b border-gray-100 text-gray-500">
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider">ID Ordine</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider">Data Consegna</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider">Prodotto/i</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider text-right">Importo</th>
                                        <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider text-center">Stato</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {MOCK_ORDERS.map((order) => (
                                        <tr key={order.id} className="hover:bg-gray-50/50 transition-colors group cursor-default">
                                            <td className="py-3 px-4 font-bold text-gray-900">{order.id}</td>
                                            <td className="py-3 px-4 text-gray-600">{order.date}</td>
                                            <td className="py-3 px-4 font-medium text-gray-800">{order.product}</td>
                                            <td className="py-3 px-4 text-right font-semibold text-gray-900">
                                                <span className="flex items-center justify-end gap-0.5">
                                                    <Euro size={14} />{order.amount.toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusColor(order.status)}`}>
                                                    {getStatusIcon(order.status)} {order.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
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
