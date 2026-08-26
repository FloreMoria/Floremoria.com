'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ZoomIn, Loader2, X, Image as ImageIcon } from 'lucide-react';
import type { ProofPhotoSlot } from '@/lib/deliveryProof/proofPhotoUrls';

type Props = {
    orderId: string;
    initialBefore?: string[];
    initialAfter?: string[];
    onPhotosUpdated?: (before: string[], after: string[]) => void;
};

function isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(file.name);
}

export default function OrderDetailProofUpload({
    orderId,
    initialBefore = [],
    initialAfter = [],
    onPhotosUpdated,
}: Props) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    const [beforePhotos, setBeforePhotos] = useState<string[]>(initialBefore);
    const [afterPhotos, setAfterPhotos] = useState<string[]>(initialAfter);

    const [selectedSlot, setSelectedSlot] = useState<ProofPhotoSlot>('after');
    const [uploading, setUploading] = useState(false);
    const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
    const [zoomUrl, setZoomUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setBeforePhotos(initialBefore);
        setAfterPhotos(initialAfter);
    }, [orderId, initialBefore, initialAfter]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []).filter(isImageFile);
        e.target.value = '';
        if (files.length === 0) return;

        setUploading(true);
        setError(null);

        let currentBefore = [...beforePhotos];
        let currentAfter = [...afterPhotos];

        try {
            for (const file of files) {
                const form = new FormData();
                form.append('action', 'upload');
                form.append('orderId', orderId);
                form.append('slot', selectedSlot);
                form.append('file', file);

                const res = await fetch('/api/dashboard/delivery-proof/photo', {
                    method: 'POST',
                    body: form,
                });
                const data = (await res.json()) as { ok?: boolean; error?: string; url?: string };
                if (!res.ok || !data.ok || !data.url) {
                    throw new Error(data.error || 'Caricamento foto non riuscito.');
                }

                if (selectedSlot === 'before') {
                    if (!currentBefore.includes(data.url)) currentBefore.push(data.url);
                } else {
                    if (!currentAfter.includes(data.url)) currentAfter.push(data.url);
                }
            }

            setBeforePhotos(currentBefore);
            setAfterPhotos(currentAfter);
            onPhotosUpdated?.(currentBefore, currentAfter);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore durante il caricamento delle foto.');
        } finally {
            setUploading(false);
        }
    };

    const handleDeletePhoto = async (url: string) => {
        if (!window.confirm('Rimuovere questa foto di garanzia dalla bacheca?')) return;
        setDeletingUrl(url);
        setError(null);

        try {
            const form = new FormData();
            form.append('action', 'delete');
            form.append('orderId', orderId);
            form.append('url', url);

            const res = await fetch('/api/dashboard/delivery-proof/photo', {
                method: 'POST',
                body: form,
            });
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Eliminazione foto non riuscita.');
            }

            const isMatch = (target: string, candidate: string) => {
                if (target === candidate) return true;
                const a = target.split('?')[0]?.split('#')[0]?.trim().toLowerCase();
                const b = candidate.split('?')[0]?.split('#')[0]?.trim().toLowerCase();
                if (a && b && a === b) return true;
                const baseA = a?.split('/').filter(Boolean).pop();
                const baseB = b?.split('/').filter(Boolean).pop();
                return Boolean(baseA && baseB && baseA.length > 5 && baseA === baseB);
            };

            const nextBefore = beforePhotos.filter((u) => !isMatch(u, url));
            const nextAfter = afterPhotos.filter((u) => !isMatch(u, url));

            setBeforePhotos(nextBefore);
            setAfterPhotos(nextAfter);
            onPhotosUpdated?.(nextBefore, nextAfter);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore durante la cancellazione.');
        } finally {
            setDeletingUrl(null);
        }
    };

    const allPhotos = [
        ...beforePhotos.map((url) => ({ url, label: 'Prima della posa', slot: 'before' as const })),
        ...afterPhotos.map((url) => ({ url, label: 'Dopo la posa', slot: 'after' as const })),
    ];

    return (
        <div className="space-y-3 font-body">
            {error ? (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                    {error}
                </div>
            ) : null}

            {/* GALLERIA MINIATURE REALI (SE PRESENTI) */}
            {allPhotos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {allPhotos.map(({ url, label }, idx) => (
                        <div
                            key={`photo-${idx}-${url}`}
                            className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-100 aspect-square shadow-sm"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={url}
                                alt={label}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                                onClick={() => setZoomUrl(url)}
                            />

                            {/* Badge Label */}
                            <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-semibold text-white">
                                {label}
                            </div>

                            {/* Action overlay (Zoom & Delete) */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setZoomUrl(url)}
                                    className="p-1.5 bg-white text-gray-800 rounded-full hover:bg-gray-100 shadow"
                                    title="Ingrandisci anteprima"
                                >
                                    <ZoomIn size={14} />
                                </button>
                                <button
                                    type="button"
                                    disabled={deletingUrl === url}
                                    onClick={() => handleDeletePhoto(url)}
                                    className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 shadow disabled:opacity-50"
                                    title="Rimuovi foto"
                                >
                                    {deletingUrl === url ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Trash2 size={14} />
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* PULSANTE COMPATTO AGGIUNGI + (SENZA SLOT O PLACEHOLDER GRIGI VUOTI) */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs">
                    <button
                        type="button"
                        onClick={() => setSelectedSlot('after')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                            selectedSlot === 'after'
                                ? 'bg-white text-black shadow-sm font-bold'
                                : 'text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        Dopo la posa
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedSlot('before')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                            selectedSlot === 'before'
                                ? 'bg-white text-black shadow-sm font-bold'
                                : 'text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        Prima della posa
                    </button>
                </div>

                <button
                    type="button"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                >
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    {uploading ? 'Caricamento in corso…' : 'Aggiungi +'}
                </button>

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                />
            </div>

            {/* MODALE ZOOM ANTEPRIMA HD */}
            {zoomUrl ? (
                <div
                    className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setZoomUrl(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-black">
                        <button
                            type="button"
                            onClick={() => setZoomUrl(null)}
                            className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-full hover:bg-black transition-colors z-10"
                        >
                            <X size={20} />
                        </button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={zoomUrl}
                            alt="Anteprima ingrandita"
                            className="max-h-[85vh] max-w-full object-contain mx-auto"
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

