'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import type { ProofPhotoSlot } from '@/lib/deliveryProof/proofPhotoUrls';

type Props = {
    orderId: string;
    initialBefore: string[];
    initialAfter: string[];
    onPhotosUpdated?: (before: string[], after: string[]) => void;
};

function isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(file.name);
}

type DropZoneProps = {
    label: string;
    slot: ProofPhotoSlot;
    orderId: string;
    photoUrl: string | null;
    onUploaded: (slot: ProofPhotoSlot, url: string) => void;
};

function ProofDropZone({ label, slot, orderId, photoUrl, onUploaded }: DropZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const uploadFile = useCallback(
        async (file: File) => {
            if (!isImageFile(file)) {
                setError('Seleziona un file immagine (JPG, PNG, HEIC, WebP).');
                return;
            }

            setUploading(true);
            setError(null);
            try {
                const form = new FormData();
                form.append('action', 'upload');
                form.append('orderId', orderId);
                form.append('slot', slot);
                form.append('file', file);

                const res = await fetch('/api/dashboard/delivery-proof/photo', {
                    method: 'POST',
                    body: form,
                });
                const data = (await res.json()) as { ok?: boolean; error?: string; url?: string };
                if (!res.ok || !data.ok || !data.url) {
                    throw new Error(data.error || 'Caricamento non riuscito.');
                }
                onUploaded(slot, data.url);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Errore durante il caricamento.');
            } finally {
                setUploading(false);
            }
        },
        [orderId, slot, onUploaded]
    );

    const handleFiles = (files: FileList | null) => {
        const file = files?.[0];
        if (file) void uploadFile(file);
    };

    return (
        <div className="space-y-1.5">
            <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFiles(e.dataTransfer.files);
                }}
                className={`relative border-2 border-dashed rounded-2xl h-36 w-full flex flex-col items-center justify-center text-gray-400 transition-all overflow-hidden ${
                    dragOver
                        ? 'bg-orange-50/80 border-fm-gold text-fm-gold'
                        : 'border-gray-300 bg-gray-50/50 hover:bg-orange-50/50 hover:text-fm-gold hover:border-fm-gold'
                } ${uploading ? 'cursor-wait opacity-80' : 'cursor-pointer'}`}
            >
                {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt={label} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                    <>
                        <div className="p-2 bg-white rounded-full shadow-sm border border-gray-100 mb-2">
                            <ImageIcon size={20} className="text-gray-600" />
                        </div>
                        <span className="text-[11px] font-semibold text-gray-800">{label}</span>
                        <span className="text-[10px] font-medium text-gray-400 mt-0.5">Drag & Drop o clicca</span>
                    </>
                )}
                {uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-7 w-7 animate-spin text-white" />
                    </div>
                ) : null}
                {photoUrl && !uploading ? (
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1.5">
                        <span className="text-[10px] font-semibold text-white">{label}</span>
                    </div>
                ) : null}
            </button>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                }}
            />
            {error ? <p className="text-[10px] text-red-600 leading-snug">{error}</p> : null}
        </div>
    );
}

export default function OrderDetailProofUpload({
    orderId,
    initialBefore,
    initialAfter,
    onPhotosUpdated,
}: Props) {
    const router = useRouter();
    const [beforeUrl, setBeforeUrl] = useState<string | null>(initialBefore[0] ?? null);
    const [afterUrl, setAfterUrl] = useState<string | null>(initialAfter[0] ?? null);

    useEffect(() => {
        setBeforeUrl(initialBefore[0] ?? null);
        setAfterUrl(initialAfter[0] ?? null);
    }, [orderId, initialBefore, initialAfter]);

    const handleUploaded = (slot: ProofPhotoSlot, url: string) => {
        const nextBefore = slot === 'before' ? [url] : beforeUrl ? [beforeUrl] : [];
        const nextAfter = slot === 'after' ? [url] : afterUrl ? [afterUrl] : [];

        if (slot === 'before') setBeforeUrl(url);
        else setAfterUrl(url);

        onPhotosUpdated?.(nextBefore, nextAfter);
        router.refresh();
    };

    return (
        <div className="grid grid-cols-2 gap-3">
            <ProofDropZone
                label="Prima della posa"
                slot="before"
                orderId={orderId}
                photoUrl={beforeUrl}
                onUploaded={handleUploaded}
            />
            <ProofDropZone
                label="Dopo la posa"
                slot="after"
                orderId={orderId}
                photoUrl={afterUrl}
                onUploaded={handleUploaded}
            />
        </div>
    );
}
